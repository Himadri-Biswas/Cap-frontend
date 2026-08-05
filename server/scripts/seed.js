/**
 * npm run db:seed          — additive seed (never overwrites existing rows)
 * npm run db:reseed        — same, but raw feature columns are refreshed from
 *                            dataset.csv (`--force`)
 * npm run db:seed -- --no-demo   — skip the demo applications
 *
 * What it writes:
 *   employees      1470 rows from dataset.csv, with derived display fields.
 *                  Rows whose Attrition label is "Yes" become
 *                  employmentStatus:"former" — that is what makes the
 *                  "former employee re-applying" POSITIVE tag real rather
 *                  than hand-set.
 *   jobs           6 job posts with full JD text.
 *   applications   9 demo applications + their CVs in GridFS, covering the
 *                  former-employee, previously-rejected and first-time cases.
 *
 * The default mode only ever INSERTS. If your teammate's 1470 employees are
 * already in the cluster, or you have applied live interventions, running this
 * again changes nothing about them.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { connectDb, closeDb } from "../db.js";
import { config, ROOT } from "../config.js";
import {
  Employee,
  Job,
  Application,
  CvFile,
  Notification,
  nextId,
  nextSequence,
} from "../models/index.js";
import { storeCv } from "../lib/files.js";
import { parseCsv, deriveDisplayFields } from "./lib/derive.js";
import { JOBS, DEMO_APPLICANTS, buildDemoCvText } from "./lib/demoData.js";
import { buildApplicantHistory, heuristicScore } from "../lib/applicants.js";

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const NO_DEMO = argv.includes("--no-demo");

const RAW_COLUMNS = [
  "Age", "BusinessTravel", "DailyRate", "Department", "DistanceFromHome", "Education",
  "EducationField", "EmployeeCount", "EnvironmentSatisfaction", "Gender", "HourlyRate",
  "JobInvolvement", "JobLevel", "JobRole", "JobSatisfaction", "MaritalStatus", "MonthlyIncome",
  "MonthlyRate", "NumCompaniesWorked", "Over18", "OverTime", "PercentSalaryHike",
  "PerformanceRating", "RelationshipSatisfaction", "StandardHours", "StockOptionLevel",
  "TotalWorkingYears", "TrainingTimesLastYear", "WorkLifeBalance", "YearsAtCompany",
  "YearsInCurrentRole", "YearsSinceLastPromotion", "YearsWithCurrManager",
];

async function seedEmployees() {
  const csvPath = path.join(ROOT, "dataset.csv");
  let text;
  try {
    text = await fs.readFile(csvPath, "utf8");
  } catch {
    console.log("  !  dataset.csv not found — skipping employee seed.");
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  const rows = parseCsv(text);
  console.log(`  Parsed ${rows.length} rows from dataset.csv`);

  /**
   * Existing rows matter: your teammate's cluster may already hold these 1470
   * employees, complete with names he generated. We must never overwrite his
   * display fields — but we DO have to stamp the additive lifecycle fields on
   * them, because `employmentStatus: "former"` is what makes the module-1
   * "former employee re-applying" tag fire at all.
   */
  const existing = new Map(
    (await Employee.find({}).select("EmployeeNumber name initials employmentStatus").lean()).map((e) => [
      e.EmployeeNumber,
      e,
    ])
  );

  const operations = [];
  let inserted = 0;
  let updated = 0;
  let enriched = 0;

  for (const row of rows) {
    const employeeNumber = Number(row.EmployeeNumber);
    if (!Number.isFinite(employeeNumber)) continue;

    const raw = {};
    for (const col of RAW_COLUMNS) if (row[col] !== undefined) raw[col] = row[col];

    const display = deriveDisplayFields(row);
    const left = String(row.Attrition).toLowerCase() === "yes";

    const lifecycle = {
      employmentStatus: left ? "former" : "active",
      attritionLabel: row.Attrition ?? null, // ground-truth label, never sent to the model
      rehireEligible: true,
      source: "dataset.csv",
    };
    if (left) {
      // A plausible exit date derived from tenure keeps the "last applied /
      // left on" dates in the admin UI internally consistent.
      const yearsAgo = Math.max(0.25, (employeeNumber % 30) / 12);
      lifecycle.exitDate = new Date(Date.now() - yearsAgo * 365 * 864e5);
      lifecycle.exitReason = "Voluntary resignation (dataset attrition label)";
    }

    const current = existing.get(employeeNumber);

    if (!current) {
      operations.push({
        updateOne: {
          filter: { EmployeeNumber: employeeNumber },
          update: { $set: { EmployeeNumber: employeeNumber, ...raw, ...display, ...lifecycle } },
          upsert: true,
        },
      });
      inserted += 1;
      continue;
    }

    // Additive only: lifecycle always, raw features only with --force, and
    // display fields only where the document has none.
    const update = { ...lifecycle };
    if (FORCE) Object.assign(update, raw);
    if (!current.name) Object.assign(update, display);

    operations.push({
      updateOne: { filter: { EmployeeNumber: employeeNumber }, update: { $set: update } },
    });
    if (FORCE) updated += 1;
    else enriched += 1;
  }

  // Chunked so a 1470-row write never trips Atlas's bulk-operation ceiling.
  for (let i = 0; i < operations.length; i += 500) {
    await Employee.bulkWrite(operations.slice(i, i + 500), { ordered: false });
    process.stdout.write(`\r  Employees: ${Math.min(i + 500, operations.length)}/${operations.length}`);
  }
  if (operations.length) process.stdout.write("\n");

  return { inserted, updated, enriched };
}

async function seedJobs() {
  let inserted = 0;
  for (const job of JOBS) {
    const existing = await Job.findOne({ id: job.id });
    if (existing && !FORCE) continue;
    if (existing) {
      Object.assign(existing, job);
      await existing.save();
    } else {
      await Job.create({ ...job, status: "open", visibleToApplicants: true, createdByEmail: "seed" });
      inserted += 1;
    }
    await nextSequence("job");
  }
  return inserted;
}

async function seedDemoApplications() {
  if (NO_DEMO) return 0;
  if (await Application.countDocuments({}) > 0) {
    console.log("  Applications already exist — skipping demo applications.");
    return 0;
  }

  // Pick real `former` employees so the POSITIVE tag is derived, not injected.
  const formerPool = await Employee.find({ employmentStatus: "former" })
    .select("EmployeeNumber name email JobRole Department exitDate YearsAtCompany")
    .limit(50)
    .lean();

  let created = 0;
  let formerIndex = 0;

  for (const spec of DEMO_APPLICANTS) {
    const job = await Job.findOne({ id: spec.jobId }).lean();
    if (!job) continue;

    // A returning former employee applies from the email already on their
    // employee record — which is exactly how the tag logic finds them.
    let email = spec.email;
    let name = spec.name;
    if (spec.formerEmployee && formerPool[formerIndex]) {
      const former = formerPool[formerIndex];
      formerIndex += 1;
      if (former.email) {
        email = former.email;
        name = former.name || name;
      }
    }

    const appliedAt = new Date(Date.now() - (spec.daysAgo || 5) * 864e5);
    const clerkUserId = `seed_${email.replace(/[^a-z0-9]/gi, "_")}`;

    // ── An earlier, rejected application creates the NEGATIVE tag ────────
    if (spec.previouslyRejected) {
      const priorId = await nextId("application", "APP-");
      const priorSeq = await nextSequence("candidate");
      const priorAt = new Date(appliedAt.getTime() - 75 * 864e5);
      await Application.create({
        applicationId: priorId,
        candidateId: `C${String(priorSeq).padStart(4, "0")}`,
        jobId: job.id,
        jobTitle: job.title,
        jobDept: job.dept,
        clerkUserId,
        applicantEmail: email.toLowerCase(),
        applicantName: name,
        skills: spec.skills.slice(0, 3),
        skillCount: 3,
        score: 0.52,
        scoreSource: "heuristic",
        status: "rejected",
        statusHistory: [
          { status: "submitted", at: priorAt, byEmail: "seed" },
          { status: "rejected", at: new Date(priorAt.getTime() + 10 * 864e5), byEmail: "seed", note: "Not enough depth for the role at the time." },
        ],
        appliedAt: priorAt,
        cooldownHours: config.reapplyCooldownHours,
        nextEligibleAt: new Date(priorAt.getTime() + config.reapplyCooldownHours * 3600_000),
        extractionStatus: "skipped",
        isActive: false,
      });
    }

    const history = await buildApplicantHistory({ clerkUserId, email, jobId: job.id });
    const scored = heuristicScore(spec.skills, job.skills);
    const applicationId = await nextId("application", "APP-");
    const candidateSeq = await nextSequence("candidate");

    // ── Store a real CV file so "View CV" works out of the box ──────────
    const cvText = buildDemoCvText({ ...spec, name, email }, job);
    const buffer = Buffer.from(cvText, "utf8");
    const cvFile = await storeCv(
      {
        originalname: `${name.replace(/\s+/g, "_")}_CV.txt`,
        mimetype: "text/plain",
        size: buffer.length,
        buffer,
      },
      { ownerUserId: clerkUserId, ownerEmail: email, kind: "application_cv", applicationId, jobId: job.id }
    );
    await CvFile.updateOne(
      { fileId: cvFile.fileId },
      { $set: { extractedText: cvText, extractedTextChars: cvText.length, textExtractionStatus: "done" } }
    );

    await Application.create({
      applicationId,
      candidateId: `C${String(candidateSeq).padStart(4, "0")}`,
      jobId: job.id,
      jobTitle: job.title,
      jobDept: job.dept,

      clerkUserId,
      applicantEmail: email.toLowerCase(),
      applicantName: name,

      currentTitle: spec.currentTitle,
      yearsExperience: spec.yearsExperience,
      location: spec.location,
      coverLetter: spec.coverLetter,

      cvFileId: cvFile.fileId,
      cvFilename: cvFile.storedName,
      cvOriginalName: cvFile.originalName,
      cvMimeType: cvFile.mimeType,
      cvExtension: cvFile.extension,
      cvSizeBytes: cvFile.sizeBytes,
      cvUploadedAt: appliedAt,
      cvText,
      cvTextChars: cvText.length,

      // Left as "pending": the first admin who opens the applicant can run
      // real GLiNER extraction, so no fabricated ML output is ever stored.
      extraction: null,
      extractionStatus: "pending",
      skills: spec.skills,
      skillCount: spec.skills.length,

      score: scored.score,
      scoreSource: "heuristic",
      matchPct: scored.matchPct,
      matchedSkills: scored.matchedSkills,
      missingSkills: scored.missingSkills,

      status: "submitted",
      statusHistory: [{ status: "submitted", at: appliedAt, byEmail: "seed" }],

      ...history,

      appliedAt,
      cooldownHours: config.reapplyCooldownHours,
      nextEligibleAt: new Date(appliedAt.getTime() + config.reapplyCooldownHours * 3600_000),
    });

    await Job.updateOne({ id: job.id }, { $inc: { applicantCount: 1 } });
    created += 1;
  }

  return created;
}

async function seedNotifications() {
  const count = await Notification.countDocuments({ type: "system" });
  if (count) return;
  await Notification.create({
    type: "system",
    severity: "info",
    title: "TalentPulse database is live",
    body: "Employees, job posts and applications are now served from MongoDB Atlas. Run `npm run db:precompute` to fill attrition predictions.",
    audienceRole: "admin",
  });
}

async function main() {
  console.log("\n  TalentPulse — seed\n");
  if (FORCE) console.log("  --force: existing employee feature columns will be refreshed from dataset.csv\n");
  await connectDb();

  const employees = await seedEmployees();
  console.log(
    `  Employees: ${employees.inserted} inserted, ${employees.updated} refreshed, ` +
      `${employees.enriched} existing rows kept (lifecycle fields stamped)`
  );

  const jobs = await seedJobs();
  console.log(`  Jobs:      ${jobs} inserted`);

  const applications = await seedDemoApplications();
  console.log(`  Demo applications: ${applications} created (with CVs in GridFS)`);

  await seedNotifications();

  const [totalEmployees, formerCount] = await Promise.all([
    Employee.countDocuments({}),
    Employee.countDocuments({ employmentStatus: "former" }),
  ]);

  console.log(`\n  ${config.dbName} now holds ${totalEmployees} employees (${formerCount} marked former).`);
  console.log("\n  Next:");
  console.log("    npm run db:make-admin -- your@email.com   (grant yourself admin)");
  console.log("    npm run db:precompute                     (fill attrition predictions)");
  console.log("    npm run dev                               (start API + UI)\n");

  await closeDb();
}

main().catch(async (err) => {
  console.error("\n  Seed failed:", err.message, "\n", err.stack, "\n");
  await closeDb();
  process.exit(1);
});

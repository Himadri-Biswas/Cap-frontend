/**
 * /api/screening — MODULE 1 fair ranking / debiasing runs.
 *
 * Two entry points, both returning the module-1 payload untouched:
 *   POST /run           — admin uploads a JD + a batch of CVs (today's flow)
 *   POST /run/from-job  — rank the CVs applicants ALREADY submitted for a job,
 *                         pulling them straight out of GridFS
 *
 * The second one is what makes the database earn its keep: the admin no longer
 * has to collect CV files by hand to screen the people who applied.
 */
import { Router } from "express";
import multer from "multer";
import { requireAdmin, asyncHandler, HttpError } from "../middleware/auth.js";
import { ScreeningRun, Application, Job, Notification, nextId } from "../models/index.js";
import { rankCandidates, extractSkillsFromText } from "../lib/ml.js";
import { readCvBuffer, storeCv, validateCv } from "../lib/files.js";
import { config } from "../config.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxCvBytes, files: 40 },
});

function summarise(result) {
  const fs = result?.fairness_summary || {};
  return {
    candidateCount: (result?.candidates || []).length,
    shortlistedCount: fs.after_debiasing?.shortlisted_count ?? 0,
    spreadBefore: fs.before_debiasing?.score_spread ?? null,
    spreadAfter: fs.after_debiasing?.score_spread ?? null,
    spreadReductionPct: fs.improvement?.spread_reduction_pct ?? null,
    mostImproved: fs.improvement?.most_improved ?? null,
  };
}

/** Best-effort skill extraction for the JD + each parsed résumé text. */
async function extractSkillSets(jobDescription, result) {
  const candidates = result?.candidates || [];
  const [jdSkills, ...cvSkills] = await Promise.all([
    jobDescription?.trim() ? extractSkillsFromText(jobDescription).catch(() => null) : Promise.resolve(null),
    ...candidates.map((c) =>
      c.resume?.trim() ? extractSkillsFromText(c.resume).catch(() => null) : Promise.resolve(null)
    ),
  ]);
  const candidateSkills = {};
  candidates.forEach((c, i) => {
    candidateSkills[c.id] = cvSkills[i] || null;
  });
  return { jdSkills, candidateSkills };
}

/**
 * The ranking backend answers with `cand_1`, `cand_2`, … numbered by the order
 * the files were posted. That index is the reliable link back to an
 * application; the parsed `name` is not, because it comes out of the CV text
 * and often differs from the name on the account ("Nasreen Akter" on the CV,
 * "Nasreen Aktar" on the application), or falls back to the filename entirely.
 */
function candidatePosition(candidate, fallbackIndex) {
  const match = /(\d+)\s*$/.exec(String(candidate?.id || ""));
  return match ? Number(match[1]) - 1 : fallbackIndex;
}

/**
 * Writes fair-ranking results back onto the matching Application documents,
 * and stamps `applicationId` onto each candidate so the UI can line the two up
 * without repeating the guesswork.
 *
 * `orderedApplications` is the application behind each posted file, in the
 * same order. When it is supplied (the from-job path) matching is exact. The
 * ad-hoc upload path has no such ordering, so it still falls back to the name.
 */
async function writeBackScores(result, jobId, runId, orderedApplications = null) {
  const candidates = result?.candidates || [];
  if (!jobId || !candidates.length) return [];

  const linked = [];
  for (const [index, candidate] of candidates.entries()) {
    let application = null;

    if (orderedApplications) {
      const position = candidatePosition(candidate, index);
      const expected = orderedApplications[position];
      if (expected) application = await Application.findOne({ applicationId: expected.applicationId });
    }

    if (!application) {
      const name = (candidate.name || "").trim();
      if (name) {
        application = await Application.findOne({
          jobId,
          applicantName: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
        });
      }
    }
    if (!application) continue;

    application.ranking = candidate;
    application.rankingRunId = runId;
    application.score = candidate.step2_fair?.fair_similarity ?? application.score;
    application.scoreSource = "module1_fair";
    application.fairRank = candidate.step2_fair?.rank ?? null;
    application.biasedRank = candidate.step1_biased?.rank ?? null;
    application.rankChange = candidate.bias_analysis?.rank_change ?? null;
    application.verdict = candidate.step2_fair?.verdict ?? null;
    await application.save();

    // Travels with the response AND into the saved run, so re-opening a run
    // later still knows which application each CV belongs to.
    candidate.applicationId = application.applicationId;
    candidate.applicantName = application.applicantName;
    linked.push(application.applicationId);
  }
  return linked;
}

// ── Admin uploads a JD + CV batch (mirrors today's Fair Candidate Screener) ──
router.post(
  "/run",
  requireAdmin,
  upload.array("files"),
  asyncHandler(async (req, res) => {
    const { job_title = "Untitled Role", job_description = "", jobId = null, storeCvs = "false" } = req.body || {};
    if (!job_description.trim()) throw new HttpError(400, "job_description is required.");
    if (!req.files?.length) throw new HttpError(400, "Upload at least one candidate CV.");

    for (const file of req.files) {
      const error = validateCv(file);
      if (error) throw new HttpError(400, `${file.originalname}: ${error}`);
    }

    const runId = await nextId("screening_run", "RUN-");
    const startedAt = Date.now();

    const result = await rankCandidates({
      jobTitle: job_title,
      jobDescription: job_description,
      files: req.files.map((f) => ({
        buffer: f.buffer,
        filename: f.originalname,
        mimeType: f.mimetype,
      })),
    });

    const { jdSkills, candidateSkills } = await extractSkillSets(job_description, result);

    let cvFileIds = [];
    if (storeCvs === "true") {
      const stored = await Promise.all(
        req.files.map((f) =>
          storeCv(f, {
            ownerUserId: req.user.clerkUserId,
            ownerEmail: req.user.email,
            kind: "screening_cv",
            jobId,
            screeningRunId: runId,
          }).catch(() => null)
        )
      );
      cvFileIds = stored.filter(Boolean).map((s) => s.fileId);
    }

    const linkedApplicationIds = await writeBackScores(result, jobId, runId);

    await ScreeningRun.create({
      runId,
      jobId,
      jobTitle: job_title,
      jobDescription: job_description,
      result,
      jdSkills,
      candidateSkills,
      ...summarise(result),
      cvFilenames: req.files.map((f) => f.originalname),
      cvFileIds,
      linkedApplicationIds,
      status: "done",
      durationMs: Date.now() - startedAt,
      createdBy: req.user.clerkUserId,
      createdByEmail: req.user.email,
    });

    if (jobId) await Job.updateOne({ id: jobId }, { $set: { lastScreeningRunId: runId } });

    res.json({ ...result, _runId: runId, _jdSkills: jdSkills, _candidateSkills: candidateSkills });
  })
);

/**
 * Rank the CVs that were already submitted for a job.
 * body: {jobId, applicationIds?: string[]}
 */
router.post(
  "/run/from-job",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { jobId, applicationIds } = req.body || {};
    if (!jobId) throw new HttpError(400, "jobId is required.");

    const job = await Job.findOne({ id: jobId }).lean();
    if (!job) throw new HttpError(404, "Job not found.");

    const filter = { jobId, cvFileId: { $ne: null }, status: { $ne: "withdrawn" } };
    if (applicationIds?.length) filter.applicationId = { $in: applicationIds };

    const applications = await Application.find(filter).lean();
    if (!applications.length) throw new HttpError(400, "No submitted CVs found for this job.");

    // `files` and `orderedApplications` are built together and stay index-
    // aligned: a CV whose bytes cannot be read drops out of BOTH, which is
    // what lets the response be mapped back by position instead of by name.
    const files = [];
    const orderedApplications = [];
    for (const app of applications) {
      const buffer = await readCvBuffer(app.cvFileId).catch(() => null);
      if (buffer) {
        files.push({ buffer, filename: app.cvOriginalName || `${app.applicantName}.pdf`, mimeType: app.cvMimeType });
        orderedApplications.push(app);
      }
    }
    if (!files.length) throw new HttpError(500, "Could not read any stored CVs from GridFS.");

    const runId = await nextId("screening_run", "RUN-");
    const startedAt = Date.now();
    const jobDescription = job.description?.trim() || [job.summary, `Required skills: ${(job.skills || []).join(", ")}.`].filter(Boolean).join("\n");

    const result = await rankCandidates({ jobTitle: job.title, jobDescription, files });
    const { jdSkills, candidateSkills } = await extractSkillSets(jobDescription, result);
    const linkedApplicationIds = await writeBackScores(result, jobId, runId, orderedApplications);

    await ScreeningRun.create({
      runId,
      jobId,
      jobTitle: job.title,
      jobDescription,
      result,
      jdSkills,
      candidateSkills,
      ...summarise(result),
      cvFilenames: files.map((f) => f.filename),
      linkedApplicationIds,
      status: "done",
      durationMs: Date.now() - startedAt,
      createdBy: req.user.clerkUserId,
      createdByEmail: req.user.email,
    });

    await Job.updateOne({ id: jobId }, { $set: { lastScreeningRunId: runId } });
    await Notification.create({
      type: "screening_complete",
      severity: "info",
      title: `Fair screening finished for ${job.title}`,
      body: `${files.length} CVs ranked · ${summarise(result).shortlistedCount} shortlisted after debiasing.`,
      audienceRole: "admin",
      entity: { kind: "screening_run", id: runId, label: job.title },
      actionView: "recruitment",
      actionId: jobId,
    }).catch(() => {});

    res.json({
      ...result,
      _runId: runId,
      _jdSkills: jdSkills,
      _candidateSkills: candidateSkills,
      _linkedApplicationIds: linkedApplicationIds,
    });
  })
);

router.get(
  "/runs",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const filter = req.query.jobId ? { jobId: req.query.jobId } : {};
    const runs = await ScreeningRun.find(filter)
      .select("-result -candidateSkills -jdSkills -jobDescription")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit || 25), 100))
      .lean();
    res.json({ runs });
  })
);

router.get(
  "/runs/:runId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const run = await ScreeningRun.findOne({ runId: req.params.runId }).lean();
    if (!run) throw new HttpError(404, "Screening run not found.");
    res.json({ run });
  })
);

export default router;

/**
 * /api/jobs — MODULE 1 job posts.
 *
 * The response objects keep exactly the field names JobPostsOnly.jsx reads
 * (id, title, dept, location, created, deadline, summary, skills[],
 * applicantCount), with `created`/`deadline` as "YYYY-MM-DD" strings so the
 * component's own Open/Closed date maths keeps working untouched.
 */
import { Router } from "express";
import { withUser, requireAdmin, requireAuth, asyncHandler, HttpError } from "../middleware/auth.js";
import { Job, Application, AuditLog, nextSequence } from "../models/index.js";
import { checkCooldown } from "../lib/applicants.js";

const router = Router();

const PUBLIC_FIELDS =
  "id title dept location created deadline summary description skills responsibilities qualifications " +
  "employmentType experienceLevel salaryMin salaryMax salaryCurrency openings status applicantCount " +
  "shortlistedCount hiredCount reapplyCooldownHours createdAt updatedAt";

router.get(
  "/",
  withUser,
  asyncHandler(async (req, res) => {
    const isAdmin = !!req.user?.roles?.includes("admin");
    const filter = isAdmin && req.query.all === "true"
      ? {}
      : { status: { $in: ["open", "closed"] }, visibleToApplicants: true };

    const jobs = await Job.find(filter).select(PUBLIC_FIELDS).sort({ deadlineAt: -1, createdAt: -1 }).lean();

    // Applicants see their own eligibility inline so the Apply button can
    // render its real state (applied / on cooldown / open) without N calls.
    let applicationsByJob = {};
    if (req.user) {
      const mine = await Application.find({ clerkUserId: req.user.clerkUserId })
        .select("jobId status appliedAt nextEligibleAt applicationId score")
        .sort({ appliedAt: -1 })
        .lean();
      for (const app of mine) {
        if (!applicationsByJob[app.jobId]) applicationsByJob[app.jobId] = app;
      }
    }

    res.json({
      jobs: jobs.map((j) => ({
        ...j,
        myApplication: applicationsByJob[j.id]
          ? {
              applicationId: applicationsByJob[j.id].applicationId,
              status: applicationsByJob[j.id].status,
              appliedAt: applicationsByJob[j.id].appliedAt,
              nextEligibleAt: applicationsByJob[j.id].nextEligibleAt,
            }
          : null,
      })),
    });
  })
);

router.get(
  "/:id",
  withUser,
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({ id: req.params.id }).lean();
    if (!job) throw new HttpError(404, "Job not found.");
    res.json({ job });
  })
);

/** Applicant-facing pre-flight: may I apply to this job right now? */
router.get(
  "/:id/eligibility",
  requireAuth,
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({ id: req.params.id }).lean();
    if (!job) throw new HttpError(404, "Job not found.");

    const [y, m, d] = String(job.deadline).split("-").map(Number);
    const closed = new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).getTime() < Date.now();

    const cooldown = await checkCooldown({
      clerkUserId: req.user.clerkUserId,
      email: req.user.email,
      jobId: job.id,
      job,
    });

    res.json({
      jobId: job.id,
      closed,
      allowed: !closed && cooldown.allowed,
      reason: closed ? "This job post has closed." : cooldown.reason || null,
      cooldownHours: cooldown.cooldownHours,
      nextEligibleAt: cooldown.nextEligibleAt || null,
      hoursRemaining: cooldown.hoursRemaining ?? 0,
      minutesRemaining: cooldown.minutesRemaining ?? 0,
      lastApplication: cooldown.lastApplication
        ? {
            applicationId: cooldown.lastApplication.applicationId,
            appliedAt: cooldown.lastApplication.appliedAt,
            status: cooldown.lastApplication.status,
          }
        : null,
    });
  })
);

// ── Admin CRUD ──────────────────────────────────────────────────────────────

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!body.title || !body.dept) throw new HttpError(400, "title and dept are required.");

    const seq = await nextSequence("job");
    const id = body.id || `J${200 + seq}`;
    if (await Job.findOne({ id })) throw new HttpError(409, `Job id ${id} already exists.`);

    const today = new Date().toISOString().slice(0, 10);
    const job = await Job.create({
      ...body,
      id,
      created: body.created || today,
      deadline: body.deadline || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      skills: body.skills || [],
      createdBy: req.user.clerkUserId,
      createdByEmail: req.user.email,
    });

    await AuditLog.create({
      action: "job.create",
      actorUserId: req.user.clerkUserId,
      actorEmail: req.user.email,
      entityKind: "job",
      entityId: job.id,
      summary: `Created job ${job.id} — ${job.title}`,
    });

    res.status(201).json({ job });
  })
);

router.patch(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({ id: req.params.id });
    if (!job) throw new HttpError(404, "Job not found.");
    const editable = [
      "title", "dept", "location", "created", "deadline", "summary", "description", "skills",
      "responsibilities", "qualifications", "employmentType", "experienceLevel", "salaryMin",
      "salaryMax", "salaryCurrency", "openings", "status", "visibleToApplicants", "reapplyCooldownHours",
    ];
    for (const key of editable) if (req.body[key] !== undefined) job[key] = req.body[key];
    await job.save();
    res.json({ job });
  })
);

router.delete(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const job = await Job.findOne({ id: req.params.id });
    if (!job) throw new HttpError(404, "Job not found.");
    job.status = "archived";
    job.visibleToApplicants = false;
    await job.save();
    res.json({ ok: true, job });
  })
);

export default router;

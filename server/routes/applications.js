/**
 * /api/applications — MODULE 1 CV submission and admin review.
 *
 * Submitting is a single multipart request that:
 *   1. enforces the re-apply freeze window,
 *   2. stores the CV in GridFS,
 *   3. calls module 1 `/read-file` then `/extract-skills?mode=gliner`
 *      (verbatim — same URLs, same payloads the frontend used),
 *   4. stores the ML response untouched plus a flattened skills[]/score pair
 *      so the existing Applicants table renders with no changes,
 *   5. stamps the former-employee / previously-rejected tags,
 *   6. notifies the admin.
 *
 * Step 3 is best-effort: if a HuggingFace Space is cold-starting, the
 * application is still saved and `extractionStatus` becomes "failed" so it can
 * be retried. A database outage in the ML path must never lose a submission.
 */
import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { requireAuth, requireAdmin, asyncHandler, HttpError, withUser } from "../middleware/auth.js";
import {
  Application,
  Job,
  Employee,
  Notification,
  User,
  AuditLog,
  CvFile,
  nextId,
  nextSequence,
  APPLICATION_STATUSES,
} from "../models/index.js";
import { storeCv, validateCv, readCvBuffer } from "../lib/files.js";
import { readFileText, extractSkillsFromFile } from "../lib/ml.js";
import {
  checkCooldown,
  buildApplicantHistory,
  flattenExtractedSkills,
  heuristicScore,
  resolveCooldownHours,
} from "../lib/applicants.js";
import { config } from "../config.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxCvBytes, files: 1 },
});

// ── Applicant: submit an application ───────────────────────────────────────
router.post(
  "/",
  requireAuth,
  upload.single("cv"),
  asyncHandler(async (req, res) => {
    const { jobId } = req.body || {};
    if (!jobId) throw new HttpError(400, "jobId is required.");

    const job = await Job.findOne({ id: jobId }).lean();
    if (!job) throw new HttpError(404, "Job not found.");
    // "open" is the only status that accepts applications — an admin who stops
    // a posting sets it to "closed", and that must hold on the server, not
    // only in the button the applicant sees.
    if (job.status !== "open" || !job.visibleToApplicants) {
      throw new HttpError(403, "This job is no longer accepting applications.", "job_closed");
    }

    const [y, m, d] = String(job.deadline).split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).getTime() < Date.now()) {
      throw new HttpError(403, "The deadline for this job post has passed.");
    }

    // ── 1. Freeze window ────────────────────────────────────────────────
    const cooldown = await checkCooldown({
      clerkUserId: req.user.clerkUserId,
      email: req.user.email,
      jobId,
      job,
    });
    if (!cooldown.allowed) {
      const err = new HttpError(429, cooldown.reason, "cooldown_active");
      err.details = {
        nextEligibleAt: cooldown.nextEligibleAt,
        hoursRemaining: cooldown.hoursRemaining,
        minutesRemaining: cooldown.minutesRemaining,
        lastAppliedAt: cooldown.lastApplication?.appliedAt,
      };
      throw err;
    }

    const applicationId = await nextId("application", "APP-");
    const candidateSeq = await nextSequence("candidate");

    /**
     * ── 2. The CV ────────────────────────────────────────────────────────
     *
     * Two ways in. The normal one now is `cvFileId`: the applicant picked a
     * document already sitting in their library, uploaded and parsed once at
     * sign-up, so there is nothing to store and usually nothing to extract —
     * the application just references the same GridFS file. A raw `cv` upload
     * still works for anyone applying before they have a library.
     */
    const requestedCvFileId = (req.body.cvFileId || "").trim();
    let cvFile;
    let cvText = "";
    let extraction = null;

    if (requestedCvFileId) {
      if (!mongoose.isValidObjectId(requestedCvFileId)) {
        throw new HttpError(400, "That CV id is not valid.", "invalid_file");
      }
      cvFile = await CvFile.findOne({
        fileId: new mongoose.Types.ObjectId(requestedCvFileId),
        deleted: { $ne: true },
      });
      if (!cvFile) throw new HttpError(404, "That CV is no longer in your library.", "invalid_file");
      if (cvFile.ownerUserId !== req.user.clerkUserId) throw new HttpError(403, "That CV is not yours.");

      cvText = (cvFile.extractedText || "").trim();
      if (cvFile.extractionStatus === "done" && cvFile.extraction) {
        // The happy path: everything was parsed at upload time.
        extraction = cvFile.extraction;
      } else {
        // Uploaded while a HuggingFace Space was cold. Retry once, now, and
        // write the result back so the next application skips this entirely.
        const buffer = await readCvBuffer(cvFile.fileId).catch(() => null);
        if (buffer) {
          const retryPayload = { buffer, filename: cvFile.originalName, mimeType: cvFile.mimeType };
          const [retryText, retryExtraction] = await Promise.all([
            cvText ? Promise.resolve(null) : readFileText(retryPayload).catch(() => null),
            extractSkillsFromFile(retryPayload).catch((err) => ({ __error: err.message })),
          ]);
          if (!cvText) cvText = (retryText?.text || "").trim();
          extraction = retryExtraction;

          if (extraction && !extraction.__error) {
            const retrySkills = flattenExtractedSkills(extraction);
            await CvFile.updateOne(
              { fileId: cvFile.fileId },
              {
                $set: {
                  extraction,
                  extractionStatus: "done",
                  extractedAt: new Date(),
                  skills: retrySkills,
                  skillCount: retrySkills.length,
                  ...(cvText
                    ? { extractedText: cvText, extractedTextChars: cvText.length, textExtractionStatus: "done" }
                    : {}),
                },
              }
            );
          }
        }
      }
    } else {
      const fileError = validateCv(req.file);
      if (fileError) throw new HttpError(400, fileError, "invalid_file");

      cvFile = await storeCv(req.file, {
        ownerUserId: req.user.clerkUserId,
        ownerEmail: req.user.email,
        kind: "application_cv",
        applicationId,
        jobId,
      });

      // ── 3. Module 1 enrichment (best-effort) ──────────────────────────
      const mlPayload = {
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: cvFile.mimeType,
      };
      const [textResult, freshExtraction] = await Promise.all([
        readFileText(mlPayload).catch(() => null),
        extractSkillsFromFile(mlPayload).catch((err) => ({ __error: err.message })),
      ]);
      cvText = (textResult?.text || "").trim();
      extraction = freshExtraction;

      if (cvText) {
        await CvFile.updateOne(
          { fileId: cvFile.fileId },
          { $set: { extractedText: cvText, extractedTextChars: cvText.length, textExtractionStatus: "done" } }
        );
      }
    }

    const extractionFailed = !extraction || extraction.__error;
    const skills = extractionFailed ? [] : flattenExtractedSkills(extraction);
    const scored = heuristicScore(skills, job.skills);

    // ── 4. Tags + history ───────────────────────────────────────────────
    const history = await buildApplicantHistory({
      clerkUserId: req.user.clerkUserId,
      email: req.user.email,
      jobId,
    });

    const cooldownHours = await resolveCooldownHours(job);
    const now = new Date();

    const application = await Application.create({
      applicationId,
      candidateId: `C${String(candidateSeq).padStart(4, "0")}`,
      jobId,
      jobTitle: job.title,
      jobDept: job.dept,

      clerkUserId: req.user.clerkUserId,
      applicantEmail: req.user.email,
      applicantName: req.body.applicantName?.trim() || req.user.fullName || req.user.email,

      phone: req.body.phone || req.user.phone,
      location: req.body.location || req.user.location,
      currentTitle: req.body.currentTitle || req.user.headline,
      yearsExperience: req.body.yearsExperience ? Number(req.body.yearsExperience) : req.user.yearsExperience,
      linkedinUrl: req.body.linkedinUrl || req.user.linkedinUrl,
      portfolioUrl: req.body.portfolioUrl || req.user.portfolioUrl,
      coverLetter: req.body.coverLetter || "",
      expectedSalary: req.body.expectedSalary ? Number(req.body.expectedSalary) : undefined,
      noticePeriodDays: req.body.noticePeriodDays ? Number(req.body.noticePeriodDays) : undefined,

      cvFileId: cvFile.fileId,
      cvFilename: cvFile.storedName,
      cvOriginalName: cvFile.originalName,
      cvMimeType: cvFile.mimeType,
      cvExtension: cvFile.extension,
      cvSizeBytes: cvFile.sizeBytes,
      cvUploadedAt: cvFile.createdAt || now,
      cvText,
      cvTextChars: cvText.length,

      extraction: extractionFailed ? null : extraction,
      extractionStatus: extractionFailed ? "failed" : "done",
      extractionError: extractionFailed ? extraction?.__error || "Skill extraction unavailable" : undefined,
      extractedAt: extractionFailed ? undefined : now,
      skills,
      skillCount: skills.length,

      score: scored.score,
      scoreSource: "heuristic",
      matchPct: scored.matchPct,
      matchedSkills: scored.matchedSkills,
      missingSkills: scored.missingSkills,

      status: "submitted",
      statusHistory: [{ status: "submitted", at: now, by: req.user.clerkUserId, byEmail: req.user.email }],

      ...history,

      appliedAt: now,
      cooldownHours,
      nextEligibleAt: new Date(now.getTime() + cooldownHours * 3600_000),
    });

    // Remember this CV as the applicant's default for next time. Skills are
    // merged, not replaced: someone with several CVs in their library would
    // otherwise lose everything the other documents contributed.
    const mergedSkills = skills.length ? [...new Set([...(req.user.skills || []), ...skills])] : null;
    await User.updateOne(
      { clerkUserId: req.user.clerkUserId },
      {
        $set: {
          defaultCvFileId: cvFile.fileId,
          defaultCvFilename: cvFile.originalName,
          ...(mergedSkills ? { skills: mergedSkills } : {}),
        },
      }
    );

    await Job.updateOne({ id: jobId }, { $inc: { applicantCount: 1 } });

    // ── 5. Tell the admin, with the tag baked into the alert ────────────
    const tagNote = application.isFormerEmployee
      ? " · former employee returning"
      : application.wasPreviouslyShortlisted
        ? " · shortlisted before, re-applying"
        : application.wasPreviouslyRejected
          ? " · previously rejected, re-applying"
          : application.isInternalCandidate
            ? " · internal candidate"
            : "";
    await Notification.create({
      type: application.isFormerEmployee
        ? "former_employee_applied"
        : application.wasPreviouslyShortlisted
          ? "shortlisted_reapplied"
          : application.wasPreviouslyRejected
            ? "rejected_reapplied"
            : "new_application",
      severity: application.isFormerEmployee || application.wasPreviouslyShortlisted ? "medium" : "info",
      title: `${application.applicantName} applied for ${job.title}`,
      body: `${skills.length} skills extracted · ${Math.round(scored.score * 100)}% match${tagNote}`,
      audienceRole: "admin",
      entity: { kind: "application", id: applicationId, label: application.applicantName },
      actionView: "recruitment",
      actionId: jobId,
      meta: { jobId, applicationId, tags: application.tags },
    }).catch(() => {});

    res.status(201).json({
      application: publicApplication(application, true),
      warning: extractionFailed
        ? "Your application was saved, but automatic skill extraction is temporarily unavailable. An admin can re-run it."
        : null,
    });
  })
);

// ── Applicant: my applications ─────────────────────────────────────────────
router.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const applications = await Application.find({ clerkUserId: req.user.clerkUserId })
      .sort({ appliedAt: -1 })
      .lean();
    res.json({ applications: applications.map((a) => publicApplication(a, true)) });
  })
);

// ── Admin: applications for a job (feeds the Applicants panel) ─────────────
router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { jobId, status, tag, q = "", limit = 500 } = req.query;
    const filter = {};
    if (jobId) filter.jobId = jobId;
    if (status) filter.status = status;
    if (tag) filter.tags = tag;
    if (q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ applicantName: rx }, { applicantEmail: rx }];
    }

    const applications = await Application.find(filter)
      .sort({ score: -1, appliedAt: -1 })
      .limit(Math.min(Number(limit), 1000))
      .lean();

    res.json({
      applications: applications.map((a, i) => ({ ...publicApplication(a, false), rank: i + 1 })),
      total: applications.length,
    });
  })
);

router.get(
  "/:applicationId",
  withUser,
  asyncHandler(async (req, res) => {
    const application = await Application.findOne({ applicationId: req.params.applicationId }).lean();
    if (!application) throw new HttpError(404, "Application not found.");

    const isOwner = req.user?.clerkUserId === application.clerkUserId;
    const isAdmin = !!req.user?.roles?.includes("admin");
    if (!isOwner && !isAdmin) throw new HttpError(403, "You cannot view this application.");

    // "Admin can click his entry and see his last applied date" — the full
    // prior-application timeline travels with the detail payload.
    const timeline = await Application.find({
      applicantEmail: application.applicantEmail,
      applicationId: { $ne: application.applicationId },
    })
      .select("applicationId jobId jobTitle appliedAt status score")
      .sort({ appliedAt: -1 })
      .lean();

    res.json({ application: publicApplication(application, isOwner), timeline });
  })
);

// ── Admin: move an application through the pipeline ────────────────────────
router.patch(
  "/:applicationId/status",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status, note = "" } = req.body || {};
    if (!APPLICATION_STATUSES.includes(status)) {
      throw new HttpError(400, `status must be one of ${APPLICATION_STATUSES.join(", ")}.`);
    }
    const application = await Application.findOne({ applicationId: req.params.applicationId });
    if (!application) throw new HttpError(404, "Application not found.");

    const previous = application.status;
    application.status = status;
    application.statusHistory.push({
      status,
      at: new Date(),
      by: req.user.clerkUserId,
      byEmail: req.user.email,
      note,
    });
    application.reviewedBy = req.user.clerkUserId;
    application.reviewedByEmail = req.user.email;
    application.reviewedAt = new Date();
    if (note) application.adminNotes = note;
    await application.save();

    const counterDelta = {};
    if (status === "shortlisted") counterDelta.shortlistedCount = 1;
    if (status === "rejected") counterDelta.rejectedCount = 1;
    if (status === "hired") counterDelta.hiredCount = 1;
    if (Object.keys(counterDelta).length) {
      await Job.updateOne({ id: application.jobId }, { $inc: counterDelta });
    }

    await Promise.all([
      AuditLog.create({
        action: "application.status",
        actorUserId: req.user.clerkUserId,
        actorEmail: req.user.email,
        entityKind: "application",
        entityId: application.applicationId,
        summary: `${application.applicantName}: ${previous} → ${status}`,
        before: { status: previous },
        after: { status },
      }),
      Notification.create({
        type: "system",
        severity: "info",
        title: `Your application for ${application.jobTitle} is now "${status.replace(/_/g, " ")}"`,
        body: note || "",
        audienceRole: null,
        targetUserId: application.clerkUserId,
        entity: { kind: "application", id: application.applicationId, label: application.jobTitle },
      }).catch(() => {}),
    ]);

    res.json({ application: publicApplication(application, false) });
  })
);

router.patch(
  "/:applicationId",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const application = await Application.findOne({ applicationId: req.params.applicationId });
    if (!application) throw new HttpError(404, "Application not found.");
    if (req.body.adminNotes !== undefined) application.adminNotes = req.body.adminNotes;
    if (req.body.starred !== undefined) application.starred = !!req.body.starred;
    await application.save();
    res.json({ application: publicApplication(application, false) });
  })
);

/** Re-run module-1 skill extraction on an already-stored CV. */
router.post(
  "/:applicationId/reextract",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const application = await Application.findOne({ applicationId: req.params.applicationId });
    if (!application) throw new HttpError(404, "Application not found.");
    if (!application.cvFileId) throw new HttpError(400, "This application has no stored CV.");

    const { readCvBuffer } = await import("../lib/files.js");
    const buffer = await readCvBuffer(application.cvFileId);
    const payload = {
      buffer,
      filename: application.cvOriginalName,
      mimeType: application.cvMimeType,
    };

    const [textResult, extraction] = await Promise.all([
      readFileText(payload).catch(() => null),
      extractSkillsFromFile(payload),
    ]);

    const job = await Job.findOne({ id: application.jobId }).lean();
    const skills = flattenExtractedSkills(extraction);
    const scored = heuristicScore(skills, job?.skills);

    application.extraction = extraction;
    application.extractionStatus = "done";
    application.extractionError = undefined;
    application.extractedAt = new Date();
    application.skills = skills;
    application.skillCount = skills.length;
    if (textResult?.text) {
      application.cvText = textResult.text.trim();
      application.cvTextChars = application.cvText.length;
    }
    // Never clobber a real ML ranking score with the heuristic.
    if (application.scoreSource === "heuristic") {
      application.score = scored.score;
      application.matchPct = scored.matchPct;
      application.matchedSkills = scored.matchedSkills;
      application.missingSkills = scored.missingSkills;
    }
    await application.save();

    res.json({ application: publicApplication(application, false) });
  })
);

/** Applicant withdraws their own application. */
router.post(
  "/:applicationId/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const application = await Application.findOne({ applicationId: req.params.applicationId });
    if (!application) throw new HttpError(404, "Application not found.");
    if (application.clerkUserId !== req.user.clerkUserId) {
      throw new HttpError(403, "You can only withdraw your own application.");
    }
    application.status = "withdrawn";
    application.isActive = false;
    application.statusHistory.push({ status: "withdrawn", at: new Date(), by: req.user.clerkUserId });
    await application.save();
    await Job.updateOne({ id: application.jobId }, { $inc: { applicantCount: -1 } });
    res.json({ application: publicApplication(application, true) });
  })
);

/**
 * Shapes an Application for the client.
 *
 * The first six fields are exactly what the existing Applicants table in
 * JobPostsOnly.jsx reads off a candidate object (`id`, `name`, `skills`,
 * `score`), so the mock array can be swapped for this one with no change to
 * the rendering code. Everything after that is additive.
 */
function publicApplication(a, includePrivate) {
  const doc = a.toObject ? a.toObject() : a;
  return {
    // ── shape the existing UI already understands ──────────────────────
    id: doc.candidateId || doc.applicationId,
    name: doc.applicantName,
    skills: doc.skills || [],
    score: doc.score ?? 0,
    highlights: buildHighlights(doc),

    // ── identifiers ────────────────────────────────────────────────────
    applicationId: doc.applicationId,
    jobId: doc.jobId,
    jobTitle: doc.jobTitle,
    email: doc.applicantEmail,

    // ── CV ─────────────────────────────────────────────────────────────
    cvFileId: doc.cvFileId ? String(doc.cvFileId) : null,
    cvOriginalName: doc.cvOriginalName,
    cvMimeType: doc.cvMimeType,
    cvExtension: doc.cvExtension,
    cvSizeBytes: doc.cvSizeBytes,
    cvUrl: doc.cvFileId ? `/api/files/${doc.cvFileId}` : null,

    // ── module 1 ML output ─────────────────────────────────────────────
    extraction: doc.extraction || null,
    extractionStatus: doc.extractionStatus,
    extractionError: doc.extractionError || null,
    skillCount: doc.skillCount ?? (doc.skills || []).length,
    matchPct: doc.matchPct ?? 0,
    matchedSkills: doc.matchedSkills || [],
    missingSkills: doc.missingSkills || [],
    scoreSource: doc.scoreSource,
    ranking: doc.ranking || null,
    verdict: doc.verdict || null,
    fairRank: doc.fairRank ?? null,
    biasedRank: doc.biasedRank ?? null,
    rankChange: doc.rankChange ?? null,

    // ── review state ───────────────────────────────────────────────────
    status: doc.status,
    statusHistory: doc.statusHistory || [],
    starred: !!doc.starred,
    adminNotes: includePrivate ? undefined : doc.adminNotes || "",

    // ── the tags + last applied date the admin sees ────────────────────
    tags: doc.tags || [],
    isFormerEmployee: !!doc.isFormerEmployee,
    isInternalCandidate: !!doc.isInternalCandidate,
    wasPreviouslyShortlisted: !!doc.wasPreviouslyShortlisted,
    previousShortlistCount: doc.previousShortlistCount || 0,
    wasPreviouslyRejected: !!doc.wasPreviouslyRejected,
    previousRejectionCount: doc.previousRejectionCount || 0,
    previousApplicationCount: doc.previousApplicationCount || 0,
    previousApplications: doc.previousApplications || [],
    lastAppliedAt: doc.lastAppliedAt || null,
    lastAppliedJobTitle: doc.lastAppliedJobTitle || null,
    lastAppliedStatus: doc.lastAppliedStatus || null,
    formerRole: doc.formerRole || null,
    formerDepartment: doc.formerDepartment || null,
    formerExitDate: doc.formerExitDate || null,
    formerTenureYears: doc.formerTenureYears ?? null,

    // ── profile snapshot ───────────────────────────────────────────────
    phone: doc.phone || "",
    location: doc.location || "",
    currentTitle: doc.currentTitle || "",
    yearsExperience: doc.yearsExperience ?? null,
    linkedinUrl: doc.linkedinUrl || "",
    portfolioUrl: doc.portfolioUrl || "",
    coverLetter: doc.coverLetter || "",

    appliedAt: doc.appliedAt,
    nextEligibleAt: doc.nextEligibleAt,
    cooldownHours: doc.cooldownHours,
  };
}

function buildHighlights(doc) {
  const out = [];
  if (doc.isFormerEmployee) out.push("Former employee returning");
  if (doc.isInternalCandidate) out.push("Internal candidate");
  if (doc.wasPreviouslyShortlisted) out.push(`Shortlisted ${doc.previousShortlistCount}× before`);
  if (doc.wasPreviouslyRejected) out.push(`Rejected ${doc.previousRejectionCount}× before`);
  if (doc.matchPct >= 70) out.push(`${doc.matchPct}% skill match`);
  if (doc.skillCount) out.push(`${doc.skillCount} skills extracted`);
  return out;
}

export default router;

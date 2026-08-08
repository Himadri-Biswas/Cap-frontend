/**
 * /api/me — the signed-in identity, roles and role switching.
 *
 * This is the endpoint the frontend calls immediately after Clerk reports a
 * session. Its `activeRole` decides which portal the user lands on, which is
 * how "one unified login portal, everyone routed to their own page" works.
 */
import { Router } from "express";
import mongoose from "mongoose";
import multer from "multer";
import { requireAuth, asyncHandler, HttpError } from "../middleware/auth.js";
import { Employee, Application, Notification, LearningPath, CvFile } from "../models/index.js";
import { storeCv, validateCv, deleteCv } from "../lib/files.js";
import { readFileText, extractSkillsFromFile } from "../lib/ml.js";
import { flattenExtractedSkills } from "../lib/applicants.js";
import { config } from "../config.js";

const router = Router();

const uploadCvs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxCvBytes, files: 10 },
});

const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "location",
  "headline",
  "yearsExperience",
  "linkedinUrl",
  "portfolioUrl",
  "skills",
];

/** The shape the CV library renders from. Never leaks another user's files. */
function publicCv(doc, defaultCvFileId) {
  return {
    fileId: String(doc.fileId),
    label: doc.label || "",
    originalName: doc.originalName,
    extension: doc.extension,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    uploadedAt: doc.createdAt,
    skills: doc.skills || [],
    skillCount: doc.skillCount || 0,
    extractionStatus: doc.extractionStatus || "pending",
    extractionError: doc.extractionError || "",
    textChars: doc.extractedTextChars || 0,
    isDefault: !!defaultCvFileId && String(defaultCvFileId) === String(doc.fileId),
  };
}

/**
 * `application_cv` is included on purpose: anyone who applied before the CV
 * library existed already has documents stored under that kind, and they would
 * otherwise open an empty library and have to re-upload a CV they had sent.
 * They cannot be deleted while an application points at them, which the DELETE
 * route enforces.
 */
const LIBRARY_KINDS = ["profile_cv", "application_cv"];

async function listMyCvs(user) {
  const docs = await CvFile.find({
    ownerUserId: user.clerkUserId,
    kind: { $in: LIBRARY_KINDS },
    deleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .lean();

  // One row per distinct document: re-applying with the same file used to
  // store a fresh copy each time, so de-duplicate on the content hash.
  const seen = new Set();
  const unique = [];
  for (const doc of docs) {
    const key = doc.checksumSha256 || String(doc.fileId);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(doc);
  }
  return unique.map((d) => publicCv(d, user.defaultCvFileId));
}

/**
 * Stores one uploaded CV and enriches it through module 1 immediately.
 *
 * Doing the extraction HERE — at upload time, once — is the whole point of the
 * library: an application later just references this fileId and reuses the
 * cached text and skills, so submitting is instant and does not depend on a
 * HuggingFace Space being warm. Extraction is best-effort; a cold Space leaves
 * `extractionStatus: "failed"` and the file is still usable.
 */
async function storeProfileCv(file, user, label) {
  const cvFile = await storeCv(file, {
    ownerUserId: user.clerkUserId,
    ownerEmail: user.email,
    kind: "profile_cv",
  });

  const mlPayload = { buffer: file.buffer, filename: file.originalname, mimeType: cvFile.mimeType };
  const [textResult, extraction] = await Promise.all([
    readFileText(mlPayload).catch(() => null),
    extractSkillsFromFile(mlPayload).catch((err) => ({ __error: err.message })),
  ]);

  const failed = !extraction || extraction.__error;
  const text = (textResult?.text || "").trim();
  const skills = failed ? [] : flattenExtractedSkills(extraction);

  const update = {
    label: label || "",
    extractedText: text,
    extractedTextChars: text.length,
    textExtractionStatus: text ? "done" : "failed",
    extraction: failed ? null : extraction,
    extractionStatus: failed ? "failed" : "done",
    extractionError: failed ? extraction?.__error || "Skill extraction unavailable" : undefined,
    extractedAt: failed ? undefined : new Date(),
    skills,
    skillCount: skills.length,
  };
  await CvFile.updateOne({ fileId: cvFile.fileId }, { $set: update });
  return { ...cvFile.toObject(), ...update };
}

/** Resolves a fileId the caller owns, or throws. */
async function ownedCv(req) {
  if (!mongoose.isValidObjectId(req.params.fileId)) throw new HttpError(400, "Invalid file id.");
  const cvFile = await CvFile.findOne({
    fileId: new mongoose.Types.ObjectId(req.params.fileId),
    kind: { $in: LIBRARY_KINDS },
    deleted: { $ne: true },
  });
  if (!cvFile) throw new HttpError(404, "CV not found.");
  if (cvFile.ownerUserId !== req.user.clerkUserId) throw new HttpError(403, "That CV is not yours.");
  return cvFile;
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    const payload = user.toPublic();

    // Cheap counters the portals show as badges.
    const [applicationCount, unreadNotifications, learningPathCount] = await Promise.all([
      Application.countDocuments({ clerkUserId: user.clerkUserId }),
      user.roles.includes("admin")
        ? Notification.countDocuments({ audienceRole: "admin", read: false, dismissed: false })
        : Notification.countDocuments({ targetUserId: user.clerkUserId, read: false, dismissed: false }),
      LearningPath.countDocuments({ clerkUserId: user.clerkUserId }),
    ]);

    let employee = null;
    if (user.employeeNumber) {
      employee = await Employee.findOne({ EmployeeNumber: user.employeeNumber })
        .select("EmployeeNumber id name initials JobRole Department joined workMode location manager skills employmentStatus")
        .lean();
    }

    const cvs = await listMyCvs(user);

    res.json({
      user: payload,
      employee,
      cvs,
      counts: { applicationCount, unreadNotifications, learningPathCount, cvCount: cvs.length },
    });
  })
);

/** Update the user's own profile fields (never roles — those are admin-only). */
router.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    for (const key of PROFILE_FIELDS) {
      if (req.body[key] !== undefined) {
        req.user[key] =
          key === "yearsExperience"
            ? req.body[key] === "" || req.body[key] == null
              ? undefined
              : Number(req.body[key])
            : req.body[key];
      }
    }
    req.user.fullName =
      [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email;
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  })
);

/**
 * Finish the one-time step that runs right after sign-up.
 *
 * Saving the profile is not deferred to this call — the onboarding screen
 * PATCHes each step as it goes and uploads each CV as it is picked, so nothing
 * is lost if the tab closes halfway. This endpoint only stamps `onboardedAt`,
 * which is what stops the app showing that screen again.
 */
router.post(
  "/onboarding",
  requireAuth,
  asyncHandler(async (req, res) => {
    for (const key of PROFILE_FIELDS) {
      if (req.body[key] !== undefined) {
        req.user[key] =
          key === "yearsExperience"
            ? req.body[key] === "" || req.body[key] == null
              ? undefined
              : Number(req.body[key])
            : req.body[key];
      }
    }
    req.user.fullName =
      [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email;
    req.user.onboardedAt = new Date();
    await req.user.save();
    res.json({ user: req.user.toPublic(), cvs: await listMyCvs(req.user) });
  })
);

// ── CV library ─────────────────────────────────────────────────────────────
router.get(
  "/cvs",
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ cvs: await listMyCvs(req.user) });
  })
);

/** Upload one or many CVs at once. Each is stored and extracted immediately. */
router.post(
  "/cvs",
  requireAuth,
  uploadCvs.array("cvs"),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!files.length) throw new HttpError(400, "Attach at least one CV file.");

    for (const file of files) {
      const error = validateCv(file);
      if (error) throw new HttpError(400, `${file.originalname}: ${error}`, "invalid_file");
    }

    // Labels travel as a parallel array so a multi-file pick can name each one.
    const labels = [].concat(req.body.labels || req.body.label || []);

    const stored = [];
    for (const [index, file] of files.entries()) {
      stored.push(await storeProfileCv(file, req.user, labels[index]));
    }

    // First CV in an empty library becomes the default to apply with.
    if (!req.user.defaultCvFileId && stored.length) {
      req.user.defaultCvFileId = stored[0].fileId;
      req.user.defaultCvFilename = stored[0].originalName;
    }
    // Keep the profile's skill list as the union of everything uploaded.
    const merged = new Set([...(req.user.skills || []), ...stored.flatMap((s) => s.skills || [])]);
    req.user.skills = [...merged];
    await req.user.save();

    res.status(201).json({
      cvs: await listMyCvs(req.user),
      added: stored.map((s) => publicCv(s, req.user.defaultCvFileId)),
      warning: stored.some((s) => s.extractionStatus === "failed")
        ? "Some CVs were saved but skill extraction is temporarily unavailable. You can still apply with them."
        : null,
    });
  })
);

/** Rename a CV. */
router.patch(
  "/cvs/:fileId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cvFile = await ownedCv(req);
    if (req.body.label !== undefined) cvFile.label = String(req.body.label).slice(0, 80);
    await cvFile.save();
    res.json({ cvs: await listMyCvs(req.user) });
  })
);

/** Pick which CV applications default to. */
router.post(
  "/cvs/:fileId/default",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cvFile = await ownedCv(req);
    req.user.defaultCvFileId = cvFile.fileId;
    req.user.defaultCvFilename = cvFile.originalName;
    await req.user.save();
    res.json({ user: req.user.toPublic(), cvs: await listMyCvs(req.user) });
  })
);

/**
 * Remove a CV from the library.
 *
 * Blocked while an application still points at it — deleting the bytes would
 * leave an admin staring at a broken CV viewer on a live application.
 */
router.delete(
  "/cvs/:fileId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const cvFile = await ownedCv(req);

    const usedBy = await Application.countDocuments({ cvFileId: cvFile.fileId });
    if (usedBy > 0) {
      throw new HttpError(
        409,
        `You have applied to ${usedBy} job${usedBy > 1 ? "s" : ""} with this CV, so it cannot be deleted.`,
        "cv_in_use"
      );
    }

    await deleteCv(cvFile.fileId);

    if (String(req.user.defaultCvFileId) === String(cvFile.fileId)) {
      const remaining = await CvFile.findOne({
        ownerUserId: req.user.clerkUserId,
        kind: { $in: LIBRARY_KINDS },
        deleted: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .lean();
      req.user.defaultCvFileId = remaining?.fileId;
      req.user.defaultCvFilename = remaining?.originalName || "";
      await req.user.save();
    }

    res.json({ user: req.user.toPublic(), cvs: await listMyCvs(req.user) });
  })
);

/**
 * Switch the hat the user is wearing.
 *
 * This is the answer to "a room cleaner who later applies for ML Engineer":
 * the person keeps ONE Clerk account and one email, holds both `employee` and
 * `applicant` in `roles`, and flips `activeRole` to apply. No second sign-up,
 * no duplicate email, no lost employment history — and their application still
 * carries the `internal_candidate` tag because the employee link is intact.
 */
router.post(
  "/active-role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!req.user.roles.includes(role)) {
      throw new HttpError(403, `You do not hold the "${role}" role.`, "role_not_held");
    }
    req.user.activeRole = role;
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  })
);

export default router;

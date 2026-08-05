/**
 * /api/files — authenticated CV delivery.
 *
 * Access rule: an admin may read any CV; everyone else may read only files
 * they uploaded. Because the bytes are streamed through this route rather than
 * exposed as a public URL, a CV link cannot leak by being copied out of the
 * page — it 403s for anyone else, which is what makes the multi-person setup
 * safe.
 *
 * `?download=1` flips Content-Disposition to attachment; the default `inline`
 * lets the browser render a PDF directly in the admin's viewer pane.
 */
import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, asyncHandler, HttpError } from "../middleware/auth.js";
import { CvFile } from "../models/index.js";
import { streamCvToResponse } from "../lib/files.js";

const router = Router();

router.get(
  "/:fileId",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.fileId)) throw new HttpError(400, "Invalid file id.");

    const cvFile = await CvFile.findOne({ fileId: new mongoose.Types.ObjectId(req.params.fileId) });
    if (!cvFile || cvFile.deleted) throw new HttpError(404, "File not found.");

    const isAdmin = req.user.roles.includes("admin");
    const isOwner = cvFile.ownerUserId === req.user.clerkUserId;
    if (!isAdmin && !isOwner) throw new HttpError(403, "You do not have access to this file.");

    cvFile.downloadCount += 1;
    cvFile.lastDownloadedAt = new Date();
    cvFile.save().catch(() => {});

    streamCvToResponse(cvFile, res, { download: req.query.download === "1" });
  })
);

/** Metadata only — used to decide whether to embed a PDF or offer a download. */
router.get(
  "/:fileId/meta",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.fileId)) throw new HttpError(400, "Invalid file id.");
    const cvFile = await CvFile.findOne({ fileId: new mongoose.Types.ObjectId(req.params.fileId) }).lean();
    if (!cvFile || cvFile.deleted) throw new HttpError(404, "File not found.");

    const isAdmin = req.user.roles.includes("admin");
    if (!isAdmin && cvFile.ownerUserId !== req.user.clerkUserId) {
      throw new HttpError(403, "You do not have access to this file.");
    }

    res.json({
      fileId: String(cvFile.fileId),
      originalName: cvFile.originalName,
      mimeType: cvFile.mimeType,
      extension: cvFile.extension,
      sizeBytes: cvFile.sizeBytes,
      kind: cvFile.kind,
      uploadedAt: cvFile.createdAt,
      /** true when the browser can render it in an <iframe> without a plugin. */
      inlineViewable: ["application/pdf", "text/plain", "text/markdown"].includes(cvFile.mimeType),
      extractedTextChars: cvFile.extractedTextChars || 0,
      downloadCount: cvFile.downloadCount,
    });
  })
);

/** Plain-text fallback so .docx CVs are still readable in-page. */
router.get(
  "/:fileId/text",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.fileId)) throw new HttpError(400, "Invalid file id.");
    const cvFile = await CvFile.findOne({ fileId: new mongoose.Types.ObjectId(req.params.fileId) }).lean();
    if (!cvFile || cvFile.deleted) throw new HttpError(404, "File not found.");

    const isAdmin = req.user.roles.includes("admin");
    if (!isAdmin && cvFile.ownerUserId !== req.user.clerkUserId) {
      throw new HttpError(403, "You do not have access to this file.");
    }
    res.json({ text: cvFile.extractedText || "", chars: cvFile.extractedTextChars || 0 });
  })
);

export default router;

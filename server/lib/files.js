/**
 * files.js — CV binaries in MongoDB GridFS.
 *
 * Why GridFS and not a folder on disk: an applicant uploading from their
 * laptop and an admin opening the CV from a different machine must see the
 * same bytes. GridFS puts the file inside the same Atlas cluster the rest of
 * the schema lives in, so there is one connection string, one backup, one
 * access-control story — and no per-deploy filesystem to lose.
 *
 * Files are chunked (255KB default) so a 15MB PDF never approaches Mongo's
 * 16MB document ceiling, and downloads stream rather than buffering.
 */
import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { getBucket } from "../db.js";
import { CvFile } from "../models/index.js";
import { config } from "../config.js";

const EXT_MIME = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".rtf": "application/rtf",
  ".odt": "application/vnd.oasis.opendocument.text",
};

export function validateCv(file) {
  if (!file) return "No file was uploaded.";
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (!config.allowedCvExtensions.includes(ext)) {
    return `Unsupported file type "${ext || "unknown"}". Allowed: ${config.allowedCvExtensions.join(", ")}.`;
  }
  if (file.size > config.maxCvBytes) {
    return `File is ${(file.size / 1048576).toFixed(1)}MB — the limit is ${(config.maxCvBytes / 1048576).toFixed(0)}MB.`;
  }
  if (!file.size) return "The uploaded file is empty.";
  return null;
}

/** Normalises the browser-reported MIME type, which is unreliable for .docx. */
export function resolveMimeType(file) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (EXT_MIME[ext]) return EXT_MIME[ext];
  return file.mimetype || "application/octet-stream";
}

/**
 * Streams a buffer into GridFS and writes its queryable `cv_files` sidecar.
 * Returns the CvFile document.
 */
export async function storeCv(file, meta = {}) {
  const bucket = getBucket();
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mimeType = resolveMimeType(file);
  const checksum = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const storedName = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;

  const fileId = await new Promise((resolve, reject) => {
    const upload = bucket.openUploadStream(storedName, {
      contentType: mimeType,
      metadata: {
        originalName: file.originalname,
        ownerUserId: meta.ownerUserId || null,
        ownerEmail: meta.ownerEmail || null,
        kind: meta.kind || "application_cv",
        applicationId: meta.applicationId || null,
        jobId: meta.jobId || null,
        checksumSha256: checksum,
      },
    });
    Readable.from(file.buffer).pipe(upload).on("error", reject).on("finish", () => resolve(upload.id));
  });

  return CvFile.create({
    fileId,
    bucket: config.gridFsBucket,
    originalName: file.originalname,
    storedName,
    extension: ext,
    mimeType,
    sizeBytes: file.size,
    checksumSha256: checksum,
    kind: meta.kind || "application_cv",
    ownerUserId: meta.ownerUserId,
    ownerEmail: meta.ownerEmail,
    applicationId: meta.applicationId,
    jobId: meta.jobId,
    screeningRunId: meta.screeningRunId,
  });
}

/** Reads a stored CV back into memory (needed to re-post it to an ML Space). */
export async function readCvBuffer(fileId) {
  const bucket = getBucket();
  const chunks = [];
  await new Promise((resolve, reject) => {
    bucket
      .openDownloadStream(fileId)
      .on("data", (c) => chunks.push(c))
      .on("error", reject)
      .on("end", resolve);
  });
  return Buffer.concat(chunks);
}

/** Pipes a stored CV straight to an HTTP response, inline or as a download. */
export function streamCvToResponse(cvFile, res, { download = false } = {}) {
  const bucket = getBucket();
  res.setHeader("Content-Type", cvFile.mimeType);
  res.setHeader("Content-Length", cvFile.sizeBytes);
  // `inline` lets the browser's native PDF viewer render it in an <iframe>;
  // the quoted filename keeps spaces and unicode intact on download.
  res.setHeader(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(cvFile.originalName)}"`
  );
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Content-Type-Options", "nosniff");

  const stream = bucket.openDownloadStream(cvFile.fileId);
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).json({ error: "File bytes are missing from GridFS." });
    else res.end();
  });
  stream.pipe(res);
}

export async function deleteCv(fileId) {
  const bucket = getBucket();
  await bucket.delete(fileId).catch(() => {});
  await CvFile.updateOne({ fileId }, { $set: { deleted: true } });
}

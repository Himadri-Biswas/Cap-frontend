/**
 * Supporting collections: `cv_files`, `audit_logs`, `app_settings`, `counters`.
 */
import mongoose from "mongoose";

// ── cv_files ────────────────────────────────────────────────────────────────
/**
 * Queryable metadata sidecar for every binary in the GridFS `cvs` bucket.
 * GridFS already stores filename/length/uploadDate, but querying `cvs.files`
 * directly from application code is awkward and its metadata is untyped —
 * this document is what the API lists, permission-checks and joins against.
 */
const cvFileSchema = new mongoose.Schema(
  {
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    bucket: { type: String, default: "cvs" },

    originalName: { type: String, required: true },
    storedName: String,
    extension: { type: String, index: true }, // ".pdf" | ".docx" | ".txt" | ...
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    checksumSha256: { type: String, index: true },

    kind: {
      type: String,
      enum: ["application_cv", "screening_cv", "job_description", "profile_cv"],
      default: "application_cv",
      index: true,
    },

    ownerUserId: { type: String, index: true }, // who uploaded it
    ownerEmail: { type: String, lowercase: true, index: true },
    applicationId: { type: String, index: true },
    jobId: { type: String, index: true },
    screeningRunId: { type: String, index: true },

    /** Cached plain text (module 1 `/read-file`) so we never re-parse a PDF. */
    extractedText: String,
    extractedTextChars: { type: Number, default: 0 },
    textExtractionStatus: { type: String, enum: ["pending", "done", "failed"], default: "pending" },

    downloadCount: { type: Number, default: 0 },
    lastDownloadedAt: Date,
    deleted: { type: Boolean, default: false, index: true },
  },
  { timestamps: true, collection: "cv_files", minimize: false }
);

export const CvFile = mongoose.model("CvFile", cvFileSchema);

// ── audit_logs ──────────────────────────────────────────────────────────────
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, index: true },
    actorUserId: { type: String, index: true },
    actorEmail: String,
    actorRole: String,
    entityKind: String,
    entityId: String,
    summary: String,
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: String,
  },
  { timestamps: true, collection: "audit_logs", minimize: false }
);
auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

// ── app_settings ────────────────────────────────────────────────────────────
/** Runtime-tunable knobs an admin can change without a redeploy. */
const appSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: mongoose.Schema.Types.Mixed,
    label: String,
    description: String,
    updatedBy: String,
  },
  { timestamps: true, collection: "app_settings", minimize: false }
);

export const AppSetting = mongoose.model("AppSetting", appSettingSchema);

// ── counters (atomic sequence generator for APP-xxxxx / RUN-xxxxx ids) ──────
const counterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { collection: "counters", versionKey: false }
);

export const Counter = mongoose.model("Counter", counterSchema);

export async function nextSequence(name) {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();
  return doc.seq;
}

export async function nextId(name, prefix, pad = 6) {
  const seq = await nextSequence(name);
  return `${prefix}${String(seq).padStart(pad, "0")}`;
}

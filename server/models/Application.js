/**
 * Application — collection `applications` (MODULE 1).
 *
 * One document per (applicant, job) submission. It carries:
 *   • the CV pointer into GridFS (bytes never live in this document),
 *   • the VERBATIM module-1 skill-extractor response (`extraction`), plus a
 *     flattened `skills[]`/`score` pair so the existing Applicants table in
 *     JobPostsOnly.jsx renders unchanged,
 *   • the re-application tags the admin sees:
 *       isFormerEmployee       → POSITIVE tag ("worked here before")
 *       wasPreviouslyShortlisted → POSITIVE tag ("shortlisted before, on an earlier application")
 *       wasPreviouslyRejected  → NEGATIVE tag ("rejected before, applied again")
 *   • `lastAppliedAt` / `previousApplications[]` so clicking an entry shows
 *     the last applied date,
 *   • `nextEligibleAt` implementing the re-apply freeze window (1 day).
 */
import mongoose from "mongoose";

export const APPLICATION_STATUSES = [
  "submitted",
  "under_review",
  "shortlisted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
];

export const APPLICANT_TAGS = [
  "former_employee", // POSITIVE — worked here before and left
  "internal_candidate", // POSITIVE — currently employed here
  "previously_shortlisted", // POSITIVE — reached "shortlisted" (or beyond) on an earlier application
  "rehire_ineligible", // NEGATIVE — left and marked not eligible
  "previously_rejected", // NEGATIVE — applied before and was rejected
  "repeat_applicant", // NEUTRAL  — has applied to this job before
];

const statusEventSchema = new mongoose.Schema(
  { _id: false, status: String, at: { type: Date, default: Date.now }, by: String, byEmail: String, note: String },
  { _id: false }
);

const previousApplicationSchema = new mongoose.Schema(
  {
    _id: false,
    applicationId: String,
    jobId: String,
    jobTitle: String,
    appliedAt: Date,
    status: String,
    score: Number,
  },
  { _id: false }
);

const applicationSchema = new mongoose.Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────
    applicationId: { type: String, required: true, unique: true, index: true }, // "APP-000123"
    jobId: { type: String, required: true, index: true }, // Job.id, e.g. "J201"
    jobTitle: String,
    jobDept: String,

    clerkUserId: { type: String, required: true, index: true },
    applicantEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    applicantName: { type: String, required: true },
    /** Stable per-candidate id the UI keys rows on (kept short: "C<seq>"). */
    candidateId: { type: String, index: true },

    // ── Submitted profile snapshot ─────────────────────────────────────────
    phone: String,
    location: String,
    currentTitle: String,
    yearsExperience: Number,
    linkedinUrl: String,
    portfolioUrl: String,
    coverLetter: String,
    expectedSalary: Number,
    noticePeriodDays: Number,

    // ── CV (bytes live in GridFS bucket `cvs`) ─────────────────────────────
    cvFileId: { type: mongoose.Schema.Types.ObjectId, index: true },
    cvFilename: String,
    cvOriginalName: String,
    cvMimeType: String,
    cvExtension: String,
    cvSizeBytes: Number,
    cvUploadedAt: Date,
    /** Plain text pulled out of the CV by module 1 `/read-file`. Powers module 2. */
    cvText: String,
    cvTextChars: { type: Number, default: 0 },

    // ── MODULE 1 ML OUTPUT (stored verbatim — never reshaped) ──────────────
    /** Full `/extract-skills?mode=gliner` response: {total, extractor, filename, skills[], categorized{}} */
    extraction: { type: mongoose.Schema.Types.Mixed, default: null },
    extractionStatus: {
      type: String,
      enum: ["pending", "done", "failed", "skipped"],
      default: "pending",
      index: true,
    },
    extractionError: String,
    extractedAt: Date,
    /** Flattened skill names — what the existing Applicants table reads. */
    skills: { type: [String], default: [] },
    skillCount: { type: Number, default: 0 },

    /** Per-candidate slice of the last `/rank-candidates/upload` run, verbatim. */
    ranking: { type: mongoose.Schema.Types.Mixed, default: null },
    rankingRunId: { type: String, index: true },
    /** 0..1 match score shown in the Applicants table (ML when available). */
    score: { type: Number, default: 0, index: true },
    scoreSource: { type: String, enum: ["heuristic", "module1_fair", "module1_biased"], default: "heuristic" },
    matchPct: { type: Number, default: 0 },
    matchedSkills: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    rank: Number,
    fairRank: Number,
    biasedRank: Number,
    rankChange: Number,
    verdict: String, // SHORTLISTED | STRONG MATCH | MATCH | WEAK MATCH | NO MATCH

    // ── Admin workflow ─────────────────────────────────────────────────────
    status: { type: String, enum: APPLICATION_STATUSES, default: "submitted", index: true },
    statusHistory: { type: [statusEventSchema], default: [] },
    adminNotes: String,
    reviewedBy: String,
    reviewedByEmail: String,
    reviewedAt: Date,
    starred: { type: Boolean, default: false },

    // ── Re-application intelligence (the tags + last applied date) ─────────
    tags: { type: [String], default: [], index: true },
    isFormerEmployee: { type: Boolean, default: false, index: true },
    formerEmployeeNumber: Number,
    formerRole: String,
    formerDepartment: String,
    formerExitDate: Date,
    formerTenureYears: Number,

    isInternalCandidate: { type: Boolean, default: false },
    wasPreviouslyShortlisted: { type: Boolean, default: false, index: true },
    previousShortlistCount: { type: Number, default: 0 },
    wasPreviouslyRejected: { type: Boolean, default: false, index: true },
    previousRejectionCount: { type: Number, default: 0 },
    previousApplicationCount: { type: Number, default: 0 },
    previousApplications: { type: [previousApplicationSchema], default: [] },
    /** Timestamp of this applicant's most recent EARLIER application (any job). */
    lastAppliedAt: { type: Date, index: true },
    lastAppliedJobId: String,
    lastAppliedJobTitle: String,
    lastAppliedStatus: String,

    // ── Cooldown ───────────────────────────────────────────────────────────
    appliedAt: { type: Date, default: Date.now, index: true },
    /** Earliest moment this user may apply to this job again. */
    nextEligibleAt: { type: Date, index: true },
    cooldownHours: { type: Number, default: 24 },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: "applications", minimize: false }
);

// Fast "all applications for this job, best first" — the Applicants panel.
applicationSchema.index({ jobId: 1, score: -1 });
// Fast cooldown check + "my applications" list.
applicationSchema.index({ clerkUserId: 1, jobId: 1, appliedAt: -1 });
applicationSchema.index({ applicantEmail: 1, appliedAt: -1 });

export const Application = mongoose.model("Application", applicationSchema);

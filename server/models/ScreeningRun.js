/**
 * ScreeningRun — collection `screening_runs` (MODULE 1, admin side).
 *
 * Persists one execution of the Fair Candidate Screener
 * (`POST /rank-candidates/upload` on the module-1 ranking/debiasing Space)
 * so a ranking survives a page refresh and can be reopened later. The whole
 * backend payload is stored verbatim under `result` — the Fairness Impact
 * banner, Rank Journey, Bias Breakdown and Score Comparison panels all read
 * their fields straight out of it, so nothing about their rendering changes.
 */
import mongoose from "mongoose";

const screeningRunSchema = new mongoose.Schema(
  {
    runId: { type: String, required: true, unique: true, index: true }, // "RUN-000007"
    jobId: { type: String, index: true }, // optional link to a Job
    jobTitle: String,
    jobDescription: String,
    jdFilename: String,

    /** Verbatim `/rank-candidates/upload` response. */
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    /** Verbatim `/extract-skills` output for the JD and each CV, keyed by candidate id. */
    jdSkills: { type: mongoose.Schema.Types.Mixed, default: null },
    candidateSkills: { type: mongoose.Schema.Types.Mixed, default: null },

    // Indexed summary so the runs list renders without loading `result`
    candidateCount: { type: Number, default: 0 },
    shortlistedCount: { type: Number, default: 0 },
    spreadBefore: Number,
    spreadAfter: Number,
    spreadReductionPct: Number,
    mostImproved: String,
    cvFilenames: { type: [String], default: [] },
    /** GridFS ids of the CVs uploaded for this run (admin-uploaded batch). */
    cvFileIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    /** applicationIds this run wrote scores back onto. */
    linkedApplicationIds: { type: [String], default: [] },

    status: { type: String, enum: ["running", "done", "failed"], default: "done", index: true },
    error: String,
    durationMs: Number,

    createdBy: String,
    createdByEmail: String,
  },
  { timestamps: true, collection: "screening_runs", minimize: false }
);
screeningRunSchema.index({ createdAt: -1 });

export const ScreeningRun = mongoose.model("ScreeningRun", screeningRunSchema);

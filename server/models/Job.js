/**
 * Job — collection `jobs` (MODULE 1).
 *
 * IMPORTANT: `created` and `deadline` stay ISO date STRINGS ("YYYY-MM-DD")
 * because JobPostsOnly.jsx parses them with
 *   `yyyy_mm_dd.split("-").map(Number)`
 * to build the Open/Closed pill. Storing real Dates here would serialise as
 * full ISO timestamps and silently break that status pill, so the string form
 * is the contract. `deadlineAt` mirrors it as a real Date for server queries.
 */
import mongoose from "mongoose";

const jobSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true }, // "J201"
    title: { type: String, required: true, index: "text" },
    dept: { type: String, required: true },
    location: { type: String, default: "Remote" },

    created: { type: String, required: true }, // "2026-02-06"  — UI contract
    deadline: { type: String, required: true }, // "2026-02-20"  — UI contract
    deadlineAt: { type: Date, index: true }, // server-side mirror

    summary: { type: String, default: "" },
    /** Long-form JD text — fed verbatim to module 1 ranking + module 2 gap analysis. */
    description: { type: String, default: "" },
    skills: { type: [String], default: [] },
    responsibilities: { type: [String], default: [] },
    qualifications: { type: [String], default: [] },

    employmentType: {
      type: String,
      enum: ["Full-time", "Part-time", "Contract", "Internship"],
      default: "Full-time",
    },
    experienceLevel: {
      type: String,
      enum: ["Intern", "Junior", "Mid-Level", "Senior", "Lead"],
      default: "Mid-Level",
    },
    salaryMin: Number,
    salaryMax: Number,
    salaryCurrency: { type: String, default: "USD" },
    openings: { type: Number, default: 1 },

    status: { type: String, enum: ["draft", "open", "closed", "archived"], default: "open", index: true },
    visibleToApplicants: { type: Boolean, default: true, index: true },

    // Denormalised counters kept fresh by the applications routes so the job
    // list can show "Applicants: N" without an aggregation per card.
    applicantCount: { type: Number, default: 0 },
    shortlistedCount: { type: Number, default: 0 },
    rejectedCount: { type: Number, default: 0 },
    hiredCount: { type: Number, default: 0 },

    /** Per-job override of the global re-apply cooldown (hours). */
    reapplyCooldownHours: { type: Number, default: null },

    createdBy: String,
    createdByEmail: String,
    lastScreeningRunId: String,
  },
  { timestamps: true, collection: "jobs", minimize: false }
);

jobSchema.pre("save", function (next) {
  if (this.deadline) {
    const [y, m, d] = String(this.deadline).split("-").map(Number);
    if (y && m && d) this.deadlineAt = new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  }
  next();
});

export const Job = mongoose.model("Job", jobSchema);

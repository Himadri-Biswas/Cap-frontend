/**
 * MODULE 2 collections — `learning_paths` and `course_progress`.
 *
 * `LearningPath.result` holds the ENTIRE `/analyze-text` response verbatim
 * (resume_skills, jd_skills, gap_analysis, learning_path, meta). UpskillingView
 * reads `result.gap_analysis.gaps`, `result.learning_path.learning_path`,
 * `result.resume_skills` — hydrating from this document is byte-identical to a
 * fresh API call, so the view's rendering path is untouched.
 *
 * The scalar columns beside it exist purely so the dashboard can aggregate
 * (average readiness, total training spend, most-common skill gaps) without
 * unpacking every stored payload.
 */
import mongoose from "mongoose";

const learningPathSchema = new mongoose.Schema(
  {
    pathId: { type: String, required: true, unique: true, index: true }, // "LP-000042"

    // Who it is for
    subjectType: { type: String, enum: ["employee", "applicant"], default: "employee", index: true },
    employeeId: { type: String, index: true }, // Employee.id e.g. "EMP0001"
    EmployeeNumber: { type: Number, index: true },
    employeeName: String,
    clerkUserId: { type: String, index: true },
    subjectEmail: { type: String, lowercase: true },

    // Target
    targetJobId: String,
    targetJobTitle: String,
    isCustomJob: { type: Boolean, default: false },
    customJobDescription: String,

    // Request knobs (exactly what the view sends)
    levelHint: { type: String, default: "Mid-Level" },
    maxHours: { type: Number, default: 120 },
    maxBudget: { type: Number, default: 300 },

    /** Verbatim module-2 `/analyze-text` response. */
    result: { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Indexed summary (mirrors of result.* — never the source of truth) ──
    jobReadiness: { type: Number, default: 0, index: true },
    nGaps: { type: Number, default: 0 },
    nMatched: { type: Number, default: 0 },
    totalLearnHours: { type: Number, default: 0 },
    totalWeeksAt5h: { type: Number, default: 0 },
    pathTotalHours: { type: Number, default: 0 },
    pathTotalCostUsd: { type: Number, default: 0 },
    nCourses: { type: Number, default: 0 },
    gapCoveragePct: { type: Number, default: 0 },
    topGaps: { type: [String], default: [] },
    uncoveredGaps: { type: [String], default: [] },
    resumeSkillCount: { type: Number, default: 0 },

    status: { type: String, enum: ["draft", "assigned", "in_progress", "completed"], default: "draft", index: true },
    assignedBy: String,
    assignedByEmail: String,
    assignedAt: Date,
    completedAt: Date,

    generatedBy: String,
    generatedByEmail: String,
    durationMs: Number,
  },
  { timestamps: true, collection: "learning_paths", minimize: false }
);
learningPathSchema.index({ createdAt: -1 });
learningPathSchema.index({ EmployeeNumber: 1, createdAt: -1 });

export const LearningPath = mongoose.model("LearningPath", learningPathSchema);

// ── course_progress ─────────────────────────────────────────────────────────
const courseProgressSchema = new mongoose.Schema(
  {
    pathId: { type: String, required: true, index: true },
    courseId: { type: String, required: true },
    courseName: String,

    clerkUserId: { type: String, index: true },
    EmployeeNumber: { type: Number, index: true },

    orderIndex: Number,
    forGap: String,
    isPrerequisiteCourse: { type: Boolean, default: false },
    difficulty: String,
    durationHours: Number,
    priceUsd: Number,
    isFree: Boolean,
    provider: String,
    url: String,

    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed", "skipped"],
      default: "not_started",
      index: true,
    },
    progressPct: { type: Number, default: 0, min: 0, max: 100 },
    hoursLogged: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
    rating: { type: Number, min: 0, max: 5 },
    note: String,
  },
  { timestamps: true, collection: "course_progress", minimize: false }
);
courseProgressSchema.index({ pathId: 1, courseId: 1 }, { unique: true });

export const CourseProgress = mongoose.model("CourseProgress", courseProgressSchema);

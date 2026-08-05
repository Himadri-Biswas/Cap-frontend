/**
 * /api/upskilling — MODULE 2 persistence.
 *
 * `POST /analyze` forwards the request body to module 2 `/analyze-text`
 * unchanged and returns the response unchanged, saving a `learning_paths`
 * document on the way through. UpskillingView therefore gets back exactly what
 * it gets today — same `gap_analysis.gaps`, same `learning_path.learning_path`,
 * same `resume_skills` — and gains history for free.
 */
import { Router } from "express";
import { requireAuth, requireRole, asyncHandler, HttpError } from "../middleware/auth.js";
import { LearningPath, CourseProgress, Employee, nextId } from "../models/index.js";
import { analyzeLearningPath } from "../lib/ml.js";

const router = Router();

router.post(
  "/analyze",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const {
      resume_text,
      jd_text,
      level_hint = "Mid-Level",
      max_hours = 200,
      max_budget = 500,
      // Context used only for storage — never forwarded to the ML backend.
      employeeId = null,
      EmployeeNumber = null,
      employeeName = null,
      targetJobId = null,
      targetJobTitle = null,
      isCustomJob = false,
      persist = true,
    } = req.body || {};

    if (!resume_text?.trim() || !jd_text?.trim()) {
      throw new HttpError(400, "resume_text and jd_text are required.");
    }

    const startedAt = Date.now();
    const result = await analyzeLearningPath({ resume_text, jd_text, level_hint, max_hours, max_budget });
    const durationMs = Date.now() - startedAt;

    if (!persist) return res.json(result);

    const gap = result.gap_analysis || {};
    const path = result.learning_path || {};
    const pathId = await nextId("learning_path", "LP-");

    await LearningPath.create({
      pathId,
      subjectType: EmployeeNumber ? "employee" : "applicant",
      employeeId,
      EmployeeNumber: EmployeeNumber ?? undefined,
      employeeName,
      clerkUserId: req.user.clerkUserId,
      subjectEmail: req.user.email,

      targetJobId,
      targetJobTitle,
      isCustomJob: !!isCustomJob,
      customJobDescription: isCustomJob ? jd_text : undefined,

      levelHint: level_hint,
      maxHours: max_hours,
      maxBudget: max_budget,

      result,

      jobReadiness: gap.job_readiness ?? 0,
      nGaps: gap.n_gaps ?? (gap.gaps || []).length,
      nMatched: gap.n_matched ?? 0,
      totalLearnHours: gap.total_learn_hours ?? 0,
      totalWeeksAt5h: gap.total_weeks_at_5h ?? 0,
      pathTotalHours: path.total_hours ?? 0,
      pathTotalCostUsd: path.total_cost_usd ?? 0,
      nCourses: path.n_courses ?? (path.learning_path || []).length,
      gapCoveragePct: path.gap_coverage_pct ?? 0,
      topGaps: (gap.gaps || []).slice(0, 8).map((g) => g.canonical_name),
      uncoveredGaps: path.uncovered_gaps || [],
      resumeSkillCount: (result.resume_skills || []).length,

      generatedBy: req.user.clerkUserId,
      generatedByEmail: req.user.email,
      durationMs,
    });

    // Seed a progress row per recommended course so the UI can track them.
    const courses = path.learning_path || [];
    if (courses.length) {
      await CourseProgress.insertMany(
        courses.map((c, idx) => ({
          pathId,
          courseId: String(c.course_id),
          courseName: c.course_name,
          clerkUserId: req.user.clerkUserId,
          EmployeeNumber: EmployeeNumber ?? undefined,
          orderIndex: idx,
          forGap: c.for_gap,
          isPrerequisiteCourse: !!c.is_prerequisite_course,
          difficulty: c.difficulty,
          durationHours: c.duration_hours,
          priceUsd: c.price_usd,
          isFree: !!c.is_free,
          provider: c.provider || c.platform || "",
          url: c.url || c.course_url || "",
        })),
        { ordered: false }
      ).catch(() => {});
    }

    // The pathId rides alongside the untouched ML payload.
    res.json({ ...result, _pathId: pathId, _persisted: true });
  })
);

router.get(
  "/paths",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { EmployeeNumber, limit = 50, mine } = req.query;
    const filter = {};
    if (EmployeeNumber) filter.EmployeeNumber = Number(EmployeeNumber);
    if (mine === "true" || !req.user.roles.includes("admin")) filter.clerkUserId = req.user.clerkUserId;

    const paths = await LearningPath.find(filter)
      .select("-result")
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit), 200))
      .lean();
    res.json({ paths });
  })
);

router.get(
  "/paths/:pathId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const path = await LearningPath.findOne({ pathId: req.params.pathId }).lean();
    if (!path) throw new HttpError(404, "Learning path not found.");
    if (!req.user.roles.includes("admin") && path.clerkUserId !== req.user.clerkUserId) {
      throw new HttpError(403, "You cannot view this learning path.");
    }
    const progress = await CourseProgress.find({ pathId: path.pathId }).sort({ orderIndex: 1 }).lean();
    res.json({ path, progress });
  })
);

/** Assign a generated path to an employee so it shows up in their portal. */
router.post(
  "/paths/:pathId/assign",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const path = await LearningPath.findOne({ pathId: req.params.pathId });
    if (!path) throw new HttpError(404, "Learning path not found.");
    const { EmployeeNumber } = req.body || {};
    if (EmployeeNumber) {
      const emp = await Employee.findOne({ EmployeeNumber: Number(EmployeeNumber) }).lean();
      if (!emp) throw new HttpError(404, "Employee not found.");
      path.EmployeeNumber = emp.EmployeeNumber;
      path.employeeId = emp.id;
      path.employeeName = emp.name;
      if (emp.clerkUserId) path.clerkUserId = emp.clerkUserId;
    }
    path.status = "assigned";
    path.assignedBy = req.user.clerkUserId;
    path.assignedByEmail = req.user.email;
    path.assignedAt = new Date();
    await path.save();
    res.json({ path: path.toObject() });
  })
);

router.patch(
  "/progress/:pathId/:courseId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status, progressPct, hoursLogged, rating, note } = req.body || {};
    const progress = await CourseProgress.findOne({ pathId: req.params.pathId, courseId: req.params.courseId });
    if (!progress) throw new HttpError(404, "Course not found in this learning path.");
    if (!req.user.roles.includes("admin") && progress.clerkUserId !== req.user.clerkUserId) {
      throw new HttpError(403, "You cannot update this course.");
    }
    if (status) {
      progress.status = status;
      if (status === "in_progress" && !progress.startedAt) progress.startedAt = new Date();
      if (status === "completed") {
        progress.completedAt = new Date();
        progress.progressPct = 100;
      }
    }
    if (progressPct !== undefined) progress.progressPct = Math.max(0, Math.min(100, Number(progressPct)));
    if (hoursLogged !== undefined) progress.hoursLogged = Number(hoursLogged);
    if (rating !== undefined) progress.rating = Number(rating);
    if (note !== undefined) progress.note = note;
    await progress.save();
    res.json({ progress: progress.toObject() });
  })
);

export default router;

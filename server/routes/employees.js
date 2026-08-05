/**
 * /api/employees — MODULE 3 employee directory + cached analysis.
 *
 * `GET /` returns objects with the SAME field names EmployeesView.jsx already
 * reads (id, initials, name, email, JobRole, Department, workMode, joined,
 * skills, plus all 34 raw HR columns), so the view's `employees` prop simply
 * points here instead of at the hard-coded array — its `/infer` POST and every
 * SHAP/DiCE panel stay exactly where they are.
 */
import { Router } from "express";
import { requireAuth, requireRole, requireAdmin, asyncHandler, HttpError } from "../middleware/auth.js";
import { Employee, Prediction, AttritionEvent, nextSequence } from "../models/index.js";
import { getAnalysis, readCachedAnalysis } from "../lib/attrition.js";

const router = Router();

router.get(
  "/",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const {
      q = "",
      department,
      workMode,
      riskTier,
      status = "active",
      limit = 300,
      skip = 0,
      withRisk = "true",
    } = req.query;

    const filter = {};
    if (status && status !== "all") filter.employmentStatus = status;
    if (department && department !== "All Department") filter.Department = department;
    if (workMode && workMode !== "All Mode") filter.workMode = workMode;
    if (q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: rx }, { email: rx }, { JobRole: rx }, { id: rx }];
    }

    // A non-admin employee only ever sees their own record.
    if (!req.user.roles.includes("admin")) {
      if (!req.user.employeeNumber) return res.json({ employees: [], total: 0 });
      filter.EmployeeNumber = req.user.employeeNumber;
    }

    const employees = await Employee.find(filter)
      .sort({ EmployeeNumber: 1 })
      .skip(Number(skip))
      .limit(Math.min(Number(limit), 2000))
      .lean();

    // Attach the cached risk summary without triggering any ML calls.
    if (withRisk !== "false" && employees.length) {
      const preds = await Prediction.find({ EmployeeNumber: { $in: employees.map((e) => e.EmployeeNumber) } })
        .select("EmployeeNumber attrition_probability risk_tier attrition_verdict primary_reason computed_at")
        .lean();
      const byNumber = new Map(preds.map((p) => [p.EmployeeNumber, p]));
      for (const emp of employees) {
        const p = byNumber.get(emp.EmployeeNumber);
        emp.attrition_probability = p?.attrition_probability ?? null;
        emp.attrition_pct = p ? Number((p.attrition_probability * 100).toFixed(2)) : null;
        emp.risk_tier = p?.risk_tier ?? null;
        emp.attrition_verdict = p?.attrition_verdict ?? null;
        emp.primary_reason = p?.primary_reason ?? null;
        emp.analysisComputedAt = p?.computed_at ?? null;
      }
    }

    let total = employees.length;
    if (Number(skip) || employees.length === Math.min(Number(limit), 2000)) {
      total = await Employee.countDocuments(filter);
    }

    if (riskTier && riskTier !== "All Risk") {
      return res.json({
        employees: employees.filter((e) => e.risk_tier === riskTier),
        total,
        filteredByRisk: true,
      });
    }

    res.json({ employees, total });
  })
);

/** Distinct values for the Department / Work mode filter chips. */
router.get(
  "/facets",
  requireRole("admin", "employee"),
  asyncHandler(async (_req, res) => {
    const [departments, workModes, jobRoles] = await Promise.all([
      Employee.distinct("Department"),
      Employee.distinct("workMode"),
      Employee.distinct("JobRole"),
    ]);
    res.json({
      departments: departments.filter(Boolean).sort(),
      workModes: workModes.filter(Boolean).sort(),
      jobRoles: jobRoles.filter(Boolean).sort(),
    });
  })
);

router.get(
  "/:employeeNumber",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const employee = await loadEmployee(req);
    const analysis = await readCachedAnalysis(employee.EmployeeNumber);
    res.json({ employee, analysis });
  })
);

/**
 * The cached module-3 analysis, computed on first request.
 *
 * Response body is the untouched `/infer` shape, so the frontend can feed it
 * straight into the same `setAnalysis(...)` state EmployeesView already uses.
 */
router.get(
  "/:employeeNumber/analysis",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const employee = await loadEmployee(req);
    const analysis = await getAnalysis(employee, { force: req.query.refresh === "true" });
    res.json(analysis);
  })
);

/** Persist an analysis the frontend obtained by calling module 3 directly. */
router.post(
  "/:employeeNumber/analysis",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const employee = await loadEmployee(req);
    const result = req.body;
    if (!result || typeof result.attrition_prob !== "number") {
      throw new HttpError(400, "Body must be a module 3 /infer response.");
    }
    const { persistInference, refreshAttritionNotifications } = await import("../lib/attrition.js");
    await persistInference(employee.EmployeeNumber, result, { source: "live" });
    await refreshAttritionNotifications().catch(() => {});
    res.json({ ok: true, EmployeeNumber: employee.EmployeeNumber });
  })
);

/** Change history for one employee (live interventions included). */
router.get(
  "/:employeeNumber/events",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const employee = await loadEmployee(req);
    const events = await AttritionEvent.find({ EmployeeNumber: employee.EmployeeNumber })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ events });
  })
);

// ── Admin: create / edit employees ─────────────────────────────────────────

router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    let employeeNumber = Number(body.EmployeeNumber);
    if (!employeeNumber) {
      const max = await Employee.findOne().sort({ EmployeeNumber: -1 }).select("EmployeeNumber").lean();
      employeeNumber = (max?.EmployeeNumber || 0) + 1;
      await nextSequence("employee");
    }
    if (await Employee.findOne({ EmployeeNumber: employeeNumber })) {
      throw new HttpError(409, `EmployeeNumber ${employeeNumber} already exists.`);
    }

    const name = (body.name || "").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    const initials = parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts.length === 1
        ? parts[0].slice(0, 2).toUpperCase()
        : `E${employeeNumber % 100}`;

    const employee = await Employee.create({
      ...body,
      EmployeeNumber: employeeNumber,
      id: body.id || `EMP${String(employeeNumber).padStart(4, "0")}`,
      initials: body.initials || initials,
      employmentStatus: body.employmentStatus || "active",
      source: "manual",
    });

    res.status(201).json({ employee });
  })
);

router.patch(
  "/:employeeNumber",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({ EmployeeNumber: Number(req.params.employeeNumber) });
    if (!employee) throw new HttpError(404, "Employee not found.");
    const blocked = new Set(["_id", "EmployeeNumber", "createdAt", "updatedAt"]);
    for (const [key, value] of Object.entries(req.body || {})) {
      if (!blocked.has(key)) employee.set(key, value);
    }
    await employee.save();
    res.json({ employee: employee.toObject() });
  })
);

/**
 * Mark an employee as having left.
 *
 * This is what later earns them the POSITIVE "former employee" tag if they
 * apply again through module 1 — the tag is derived, never hand-set.
 */
router.post(
  "/:employeeNumber/offboard",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employee = await Employee.findOne({ EmployeeNumber: Number(req.params.employeeNumber) });
    if (!employee) throw new HttpError(404, "Employee not found.");
    employee.employmentStatus = "former";
    employee.exitDate = req.body.exitDate ? new Date(req.body.exitDate) : new Date();
    employee.exitReason = req.body.exitReason || "";
    if (req.body.rehireEligible !== undefined) employee.rehireEligible = !!req.body.rehireEligible;
    await employee.save();
    res.json({ employee: employee.toObject() });
  })
);

async function loadEmployee(req) {
  const key = req.params.employeeNumber;
  const employee = await Employee.findOne(
    Number.isFinite(Number(key)) ? { EmployeeNumber: Number(key) } : { id: key }
  ).lean();
  if (!employee) throw new HttpError(404, "Employee not found.");
  if (!req.user.roles.includes("admin") && req.user.employeeNumber !== employee.EmployeeNumber) {
    throw new HttpError(403, "You can only view your own employee record.");
  }
  return employee;
}

export default router;

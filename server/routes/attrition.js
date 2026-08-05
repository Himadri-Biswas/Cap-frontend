/**
 * /api/attrition — the LIVE attrition engine.
 *
 * `POST /:employeeNumber/apply` is the "admin clicks Lessen Distance" path:
 * the counterfactual is written onto the real employee document, module 3 is
 * re-run on the changed record, and the new probability is persisted to
 * MongoDB Atlas. The response is a full `/infer`-shaped object, so the
 * frontend replaces its `analysis` state with it and every panel — risk
 * header, SHAP drivers, DiCE plans — re-renders from real, freshly stored
 * numbers.
 */
import { Router } from "express";
import { requireAdmin, requireRole, asyncHandler, HttpError } from "../middleware/auth.js";
import {
  Employee,
  Prediction,
  AttritionEvent,
  Intervention,
  MUTABLE_NUMERIC_FEATURES,
  MUTABLE_CATEGORICAL_FEATURES,
} from "../models/index.js";
import { applyIntervention, refreshAttritionNotifications, readCachedAnalysis } from "../lib/attrition.js";

const router = Router();

const NUMERIC = new Set(MUTABLE_NUMERIC_FEATURES);
const CATEGORICAL = MUTABLE_CATEGORICAL_FEATURES;

/**
 * Validates a requested change against the allow-list.
 *
 * Only features a business can actually act on may move. Nothing lets an
 * admin edit Age or Gender to game the score — those are neither in the
 * numeric list nor the categorical map, so they are rejected outright.
 */
function validateChange(feature, rawValue) {
  if (NUMERIC.has(feature)) {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) throw new HttpError(400, `${feature} must be a number.`);
    if (value < 0) throw new HttpError(400, `${feature} cannot be negative.`);
    return value;
  }
  if (feature in CATEGORICAL) {
    const allowed = CATEGORICAL[feature];
    const value = String(rawValue);
    if (allowed && !allowed.includes(value)) {
      throw new HttpError(400, `${feature} must be one of: ${allowed.join(", ")}.`);
    }
    return value;
  }
  throw new HttpError(
    400,
    `"${feature}" is not an actionable feature. Allowed: ${[...NUMERIC, ...Object.keys(CATEGORICAL)].join(", ")}.`,
    "feature_not_actionable"
  );
}

/** What the UI may offer as an "apply this" control. */
router.get(
  "/actionable-features",
  requireRole("admin"),
  asyncHandler(async (_req, res) => {
    res.json({
      numeric: MUTABLE_NUMERIC_FEATURES,
      categorical: Object.fromEntries(
        Object.entries(CATEGORICAL).map(([k, v]) => [k, v || "any"])
      ),
    });
  })
);

/**
 * Apply an intervention live.
 * body: {feature, value, cfIndex?, interventionLabel?}
 */
router.post(
  "/:employeeNumber/apply",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeNumber = Number(req.params.employeeNumber);
    const employee = await Employee.findOne({ EmployeeNumber: employeeNumber }).lean();
    if (!employee) throw new HttpError(404, "Employee not found.");

    const { feature, value, cfIndex = null, interventionLabel = "" } = req.body || {};
    if (!feature) throw new HttpError(400, "feature is required.");
    const coerced = validateChange(feature, value);

    if (employee[feature] === coerced) {
      throw new HttpError(400, `${feature} is already ${coerced} — nothing to apply.`, "no_change");
    }

    const result = await applyIntervention(employee, {
      feature,
      value: coerced,
      cfIndex,
      interventionLabel,
      actor: { clerkUserId: req.user.clerkUserId, email: req.user.email },
    });

    res.json(result);
  })
);

/** Undo the most recent live intervention for an employee. */
router.post(
  "/:employeeNumber/revert",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const employeeNumber = Number(req.params.employeeNumber);
    const lastEvent = await AttritionEvent.findOne({
      EmployeeNumber: employeeNumber,
      action: "intervention_applied",
    })
      .sort({ createdAt: -1 })
      .lean();
    if (!lastEvent) throw new HttpError(404, "No intervention to revert for this employee.");

    const employee = await Employee.findOne({ EmployeeNumber: employeeNumber }).lean();
    if (!employee) throw new HttpError(404, "Employee not found.");

    const result = await applyIntervention(employee, {
      feature: lastEvent.feature,
      value: lastEvent.from_value,
      cfIndex: null,
      interventionLabel: `Reverted: ${lastEvent.intervention_label}`,
      actor: { clerkUserId: req.user.clerkUserId, email: req.user.email },
    });

    await Intervention.updateMany(
      { EmployeeNumber: employeeNumber, feature_changed: lastEvent.feature },
      { $set: { applied: false, applied_at: null } }
    );
    await AttritionEvent.updateOne({ _id: lastEvent._id }, { $set: { action: "reverted" } });

    res.json(result);
  })
);

/** Top-N riskiest employees — the source for the admin notification list. */
router.get(
  "/top-risk",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 5), 50);
    const preds = await Prediction.find({})
      .sort({ attrition_probability: -1 })
      .limit(limit)
      .lean();

    const employees = await Employee.find({ EmployeeNumber: { $in: preds.map((p) => p.EmployeeNumber) } })
      .select("EmployeeNumber id name initials JobRole Department workMode email")
      .lean();
    const byNumber = new Map(employees.map((e) => [e.EmployeeNumber, e]));

    res.json({
      employees: preds.map((p, i) => ({
        rank: i + 1,
        EmployeeNumber: p.EmployeeNumber,
        ...(byNumber.get(p.EmployeeNumber) || {}),
        attrition_probability: p.attrition_probability,
        attrition_pct: Number((p.attrition_probability * 100).toFixed(1)),
        risk_tier: p.risk_tier,
        primary_reason: p.primary_reason,
        computed_at: p.computed_at,
      })),
    });
  })
);

/** Risk distribution for the dashboard chart. */
router.get(
  "/distribution",
  requireRole("admin", "employee"),
  asyncHandler(async (_req, res) => {
    const [rows, totalEmployees, analysed] = await Promise.all([
      Prediction.aggregate([
        { $group: { _id: "$risk_tier", count: { $sum: 1 }, avgProb: { $avg: "$attrition_probability" } } },
      ]),
      Employee.countDocuments({ employmentStatus: "active" }),
      Prediction.countDocuments({}),
    ]);

    const tiers = { Low: 0, Medium: 0, High: 0, Critical: 0 };
    for (const r of rows) if (r._id in tiers) tiers[r._id] = r.count;

    const denominator = analysed || 1;
    res.json({
      totalEmployees,
      analysed,
      pending: Math.max(0, totalEmployees - analysed),
      tiers,
      percentages: Object.fromEntries(
        Object.entries(tiers).map(([k, v]) => [k, Number(((v / denominator) * 100).toFixed(1))])
      ),
      averageProbability: rows.length
        ? Number((rows.reduce((s, r) => s + r.avgProb * r.count, 0) / denominator).toFixed(4))
        : 0,
    });
  })
);

/** Global feed of live changes — an admin "what happened recently" panel. */
router.get(
  "/events",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const events = await AttritionEvent.find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit || 50), 200))
      .lean();
    res.json({ events });
  })
);

router.post(
  "/refresh-notifications",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const count = await refreshAttritionNotifications();
    res.json({ ok: true, alerts: count });
  })
);

/** Cheap re-read used to poll a single employee after an intervention. */
router.get(
  "/:employeeNumber",
  requireRole("admin", "employee"),
  asyncHandler(async (req, res) => {
    const employeeNumber = Number(req.params.employeeNumber);
    if (!req.user.roles.includes("admin") && req.user.employeeNumber !== employeeNumber) {
      throw new HttpError(403, "You can only view your own attrition analysis.");
    }
    const analysis = await readCachedAnalysis(employeeNumber);
    if (!analysis) throw new HttpError(404, "No analysis computed for this employee yet.");
    res.json(analysis);
  })
);

export default router;

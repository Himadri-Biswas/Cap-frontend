/**
 * attrition.js — MODULE 3 persistence + the "LIVE attrition" engine.
 *
 * The contract with the frontend is that everything returned from here has
 * the EXACT shape of module 3's `POST /infer` response:
 *
 *   {attrition_prob, attrition_pct, attrition_verdict, risk_tier, primary_reason,
 *    reason_probs{}, shap_base_value, shap_top5[], dice_plans[]}
 *
 * EmployeesView.jsx already renders that object. Whether it came fresh from the
 * ML Space, from the MongoDB cache, or from a live intervention re-run, the
 * component cannot tell the difference — which is exactly why none of its
 * inference wiring had to move.
 */
import {
  Employee,
  Prediction,
  ShapExplanation,
  Intervention,
  AttritionEvent,
  Notification,
  RAW_FEATURE_KEYS,
} from "../models/index.js";
import { inferAttrition } from "./ml.js";
import { config } from "../config.js";

/** Extracts the 34-column payload module 3 expects, in the same order. */
export function buildFeaturePayload(emp) {
  const payload = { EmployeeNumber: emp.EmployeeNumber };
  for (const key of RAW_FEATURE_KEYS) payload[key] = emp[key];
  payload.EmployeeCount = emp.EmployeeCount ?? 1;
  payload.StandardHours = emp.StandardHours ?? 80;
  payload.Over18 = emp.Over18 ?? "Y";
  payload.DailyRate = emp.DailyRate ?? 800;
  payload.HourlyRate = emp.HourlyRate ?? 60;
  payload.MonthlyRate = emp.MonthlyRate ?? 14000;
  return payload;
}

export function riskTierOf(prob) {
  if (prob >= 0.7) return "Critical";
  if (prob >= 0.5) return "High";
  if (prob >= 0.3) return "Medium";
  return "Low";
}

/** Writes a `/infer` result into predictions + shap_explanations + interventions. */
export async function persistInference(employeeNumber, result, opts = {}) {
  const { source = "live", baselineProbability = null, lastIntervention = null } = opts;
  const prob = Number(result.attrition_prob ?? 0);

  const predictionUpdate = {
    EmployeeNumber: employeeNumber,
    attrition_probability: prob,
    attrition_pct: Number(result.attrition_pct ?? prob * 100),
    attrition_verdict: result.attrition_verdict ?? (prob >= 0.5 ? "Yes" : "No"),
    risk_tier: result.risk_tier ?? riskTierOf(prob),
    primary_reason: result.primary_reason ?? "N/A",
    reason_prob_burnout: Number(result.reason_probs?.Burnout ?? 0),
    reason_prob_compensation: Number(result.reason_probs?.Compensation ?? 0),
    reason_prob_stagnation: Number(result.reason_probs?.Stagnation ?? 0),
    reason_prob_career_growth: Number(result.reason_probs?.["Career Growth"] ?? 0),
    computed_at: new Date(),
    source,
  };
  if (baselineProbability != null) predictionUpdate.baseline_probability = baselineProbability;
  if (lastIntervention) predictionUpdate.last_intervention = lastIntervention;

  const inc = lastIntervention ? { interventions_applied: 1 } : undefined;

  await Prediction.updateOne(
    { EmployeeNumber: employeeNumber },
    { $set: predictionUpdate, ...(inc ? { $inc: inc } : {}), $setOnInsert: { baseline_probability: prob } },
    { upsert: true }
  );

  // ── SHAP: teammate's flat layout + the rich array side by side ──────────
  const shapDoc = {
    EmployeeNumber: employeeNumber,
    base_value: Number(result.shap_base_value ?? 0),
    shap_top5: result.shap_top5 || [],
    computed_at: new Date(),
    source,
  };
  for (let rank = 1; rank <= 5; rank += 1) {
    const item = (result.shap_top5 || []).find((s) => s.rank === rank);
    shapDoc[`shap_feature_${rank}`] = item?.feature ?? null;
    shapDoc[`shap_value_${rank}`] = item?.shap_value ?? null;
  }
  await ShapExplanation.updateOne({ EmployeeNumber: employeeNumber }, { $set: shapDoc }, { upsert: true });

  // ── DiCE: replace this employee's plan set, preserving `applied` marks ──
  const previouslyApplied = await Intervention.find({ EmployeeNumber: employeeNumber, applied: true }).lean();
  const appliedKeys = new Set(previouslyApplied.map((i) => `${i.feature_changed}|${i.suggested_value}`));

  await Intervention.deleteMany({ EmployeeNumber: employeeNumber, applied: { $ne: true } });
  const plans = result.dice_plans || [];
  if (plans.length) {
    await Intervention.insertMany(
      plans.map((p) => ({
        EmployeeNumber: employeeNumber,
        cf_index: p.cf_index,
        feature_changed: p.feature_changed,
        feature_label: p.feature_label,
        current_value: p.current_value,
        suggested_value: p.suggested_value,
        new_attrition_prob: p.new_attrition_prob,
        risk_reduction: p.risk_reduction,
        intervention_label: p.intervention_label,
        applied: appliedKeys.has(`${p.feature_changed}|${p.suggested_value}`),
        computed_at: new Date(),
        source,
      })),
      { ordered: false }
    ).catch(() => {});
  }

  await Employee.updateOne({ EmployeeNumber: employeeNumber }, { $set: { latestPredictionAt: new Date() } });
  return predictionUpdate;
}

/** Rebuilds a `/infer`-shaped object out of MongoDB. Null if never computed. */
export async function readCachedAnalysis(employeeNumber) {
  const [pred, shap, dice] = await Promise.all([
    Prediction.findOne({ EmployeeNumber: employeeNumber }).lean(),
    ShapExplanation.findOne({ EmployeeNumber: employeeNumber }).lean(),
    Intervention.find({ EmployeeNumber: employeeNumber }).sort({ cf_index: 1 }).lean(),
  ]);
  if (!pred) return null;

  const prob = Number(pred.attrition_probability ?? 0);
  return {
    attrition_prob: Number(prob.toFixed(4)),
    attrition_pct: Number((prob * 100).toFixed(2)),
    attrition_verdict: pred.attrition_verdict ?? "No",
    risk_tier: pred.risk_tier ?? riskTierOf(prob),
    primary_reason: pred.primary_reason ?? "N/A",
    reason_probs: {
      Burnout: pred.reason_prob_burnout ?? 0,
      Compensation: pred.reason_prob_compensation ?? 0,
      Stagnation: pred.reason_prob_stagnation ?? 0,
      "Career Growth": pred.reason_prob_career_growth ?? 0,
    },
    shap_base_value: shap?.base_value ?? 0,
    shap_top5: shap?.shap_top5?.length
      ? shap.shap_top5
      : rebuildShapTop5(shap),
    dice_plans: (dice || []).map((d) => ({
      cf_index: d.cf_index,
      feature_changed: d.feature_changed,
      feature_label: d.feature_label,
      current_value: d.current_value,
      suggested_value: d.suggested_value,
      new_attrition_prob: d.new_attrition_prob,
      risk_reduction: d.risk_reduction,
      intervention_label: d.intervention_label,
      applied: !!d.applied,
      applied_at: d.applied_at || null,
    })),
    // Provenance so the UI can show "cached • 2 min ago" without guessing.
    _cached: true,
    _computed_at: pred.computed_at || pred.updatedAt || null,
    _source: pred.source || "live",
    _baseline_probability: pred.baseline_probability ?? null,
    _interventions_applied: pred.interventions_applied ?? 0,
  };
}

/** Fallback for documents written by the teammate's backend (flat SHAP only). */
function rebuildShapTop5(shap) {
  if (!shap) return [];
  const out = [];
  for (let rank = 1; rank <= 5; rank += 1) {
    const feature = shap[`shap_feature_${rank}`];
    const value = shap[`shap_value_${rank}`];
    if (feature == null || value == null) break;
    out.push({
      rank,
      feature,
      feature_label: feature,
      shap_value: Number(value),
      raw_value: null,
      direction: Number(value) > 0 ? "risk" : "protective",
    });
  }
  return out;
}

/**
 * Returns the analysis for an employee, computing it through module 3 only
 * when the cache is empty or `force` is set. This is the lazy fill that keeps
 * the first `npm run db:seed` instant.
 */
export async function getAnalysis(employee, { force = false, source = "live" } = {}) {
  if (!force) {
    const cached = await readCachedAnalysis(employee.EmployeeNumber);
    if (cached) return cached;
  }
  const result = await inferAttrition(buildFeaturePayload(employee));
  await persistInference(employee.EmployeeNumber, result, { source });
  await refreshAttritionNotifications().catch(() => {});
  return { ...result, _cached: false, _computed_at: new Date(), _source: source };
}

/**
 * LIVE ATTRITION: writes a counterfactual back onto the employee, re-runs the
 * real model on the changed record, and persists the new probability.
 *
 * `feature` must be a real IBM HR column; the caller (routes/attrition.js)
 * validates it against the mutable-feature allow-list first.
 */
export async function applyIntervention(employee, { feature, value, cfIndex, interventionLabel, actor }) {
  const before = await readCachedAnalysis(employee.EmployeeNumber);
  const probBefore = before?.attrition_prob ?? null;
  const fromValue = employee[feature];

  // 1. Mutate the employee record (this is the real, persisted change).
  await Employee.updateOne(
    { EmployeeNumber: employee.EmployeeNumber },
    { $set: { [feature]: value, lastInterventionAt: new Date() } }
  );
  const updated = await Employee.findOne({ EmployeeNumber: employee.EmployeeNumber }).lean();

  // 2. Re-run the untouched module-3 model on the changed record.
  const result = await inferAttrition(buildFeaturePayload(updated));
  const probAfter = Number(result.attrition_prob ?? 0);

  const featureLabel =
    (before?.dice_plans || []).find((p) => p.feature_changed === feature)?.feature_label ||
    result.shap_top5?.find((s) => s.feature === feature)?.feature_label ||
    feature;

  // 3. Persist the new prediction / SHAP / DiCE set.
  await persistInference(employee.EmployeeNumber, result, {
    source: "intervention",
    baselineProbability: before?._baseline_probability ?? probBefore ?? probAfter,
    lastIntervention: {
      feature,
      feature_label: featureLabel,
      from_value: fromValue,
      to_value: value,
      applied_at: new Date(),
      applied_by: actor?.clerkUserId || "system",
    },
  });

  // 4. Mark the matching DiCE row as applied.
  if (cfIndex != null || interventionLabel) {
    await Intervention.updateMany(
      {
        EmployeeNumber: employee.EmployeeNumber,
        feature_changed: feature,
        ...(cfIndex != null ? { cf_index: cfIndex } : {}),
      },
      {
        $set: {
          applied: true,
          applied_at: new Date(),
          applied_by: actor?.clerkUserId || "system",
          applied_by_email: actor?.email || "",
          realised_prob: probAfter,
        },
      }
    );
  }

  // 5. Immutable audit trail.
  const event = await AttritionEvent.create({
    EmployeeNumber: employee.EmployeeNumber,
    employeeName: employee.name,
    action: "intervention_applied",
    feature,
    feature_label: featureLabel,
    from_value: fromValue,
    to_value: value,
    cf_index: cfIndex ?? null,
    intervention_label: interventionLabel || `${featureLabel}: ${fromValue} → ${value}`,
    prob_before: probBefore,
    prob_after: probAfter,
    delta: probBefore == null ? null : Number((probAfter - probBefore).toFixed(4)),
    risk_tier_before: before?.risk_tier ?? null,
    risk_tier_after: result.risk_tier ?? riskTierOf(probAfter),
    primary_reason_before: before?.primary_reason ?? null,
    primary_reason_after: result.primary_reason ?? null,
    performedBy: actor?.clerkUserId || "system",
    performedByEmail: actor?.email || "",
  });

  // 6. Tell the admin bell about a meaningful improvement.
  if (probBefore != null && probAfter < probBefore - 0.02) {
    await Notification.create({
      type: "attrition_improved",
      severity: "info",
      title: `Risk down ${((probBefore - probAfter) * 100).toFixed(1)}% for ${employee.name || `#${employee.EmployeeNumber}`}`,
      body: `${featureLabel}: ${fromValue} → ${value}. Attrition probability ${(probBefore * 100).toFixed(1)}% → ${(probAfter * 100).toFixed(1)}%.`,
      audienceRole: "admin",
      entity: { kind: "employee", id: String(employee.EmployeeNumber), label: employee.name || "" },
      actionView: "employees",
      actionId: employee.id || String(employee.EmployeeNumber),
      meta: { probBefore, probAfter, feature },
    }).catch(() => {});
  }

  await refreshAttritionNotifications().catch(() => {});

  return {
    ...result,
    _cached: false,
    _computed_at: new Date(),
    _source: "intervention",
    _applied: {
      feature,
      feature_label: featureLabel,
      from_value: fromValue,
      to_value: value,
      prob_before: probBefore,
      prob_after: probAfter,
      delta: probBefore == null ? null : Number((probAfter - probBefore).toFixed(4)),
      eventId: String(event._id),
    },
  };
}

/**
 * Recomputes the standing "top N riskiest employees" admin alert.
 *
 * De-duplicated by `dedupeKey = attrition_risk:<EmployeeNumber>`: an employee
 * who stays in the top 5 keeps ONE notification whose body is refreshed, and
 * anyone who drops out is dismissed. That is what stops the bell filling with
 * hundreds of identical rows.
 */
export async function refreshAttritionNotifications() {
  const topN = config.attritionNotifyTopN;
  const threshold = config.attritionNotifyThreshold;

  const top = await Prediction.find({ attrition_probability: { $gte: threshold } })
    .sort({ attrition_probability: -1 })
    .limit(topN)
    .lean();

  const employees = await Employee.find({ EmployeeNumber: { $in: top.map((t) => t.EmployeeNumber) } })
    .select("EmployeeNumber name id JobRole Department initials")
    .lean();
  const byNumber = new Map(employees.map((e) => [e.EmployeeNumber, e]));

  const keepKeys = [];
  for (const [index, pred] of top.entries()) {
    const emp = byNumber.get(pred.EmployeeNumber);
    const dedupeKey = `attrition_risk:${pred.EmployeeNumber}`;
    keepKeys.push(dedupeKey);
    const pct = (pred.attrition_probability * 100).toFixed(1);
    await Notification.updateOne(
      { dedupeKey },
      {
        $set: {
          type: "attrition_risk",
          severity: pred.risk_tier === "Critical" ? "critical" : pred.risk_tier === "High" ? "high" : "medium",
          title: `${emp?.name || `Employee #${pred.EmployeeNumber}`} — ${pct}% attrition risk`,
          body: `${emp?.JobRole || "Unknown role"} · ${emp?.Department || "—"} · primary driver: ${pred.primary_reason || "N/A"}`,
          audienceRole: "admin",
          entity: { kind: "employee", id: String(pred.EmployeeNumber), label: emp?.name || "" },
          actionView: "employees",
          actionId: emp?.id || String(pred.EmployeeNumber),
          rank: index + 1,
          dismissed: false,
          meta: {
            EmployeeNumber: pred.EmployeeNumber,
            employeeId: emp?.id || null,
            initials: emp?.initials || null,
            probability: pred.attrition_probability,
            risk_tier: pred.risk_tier,
            primary_reason: pred.primary_reason,
          },
        },
        $setOnInsert: { read: false },
      },
      { upsert: true }
    );
  }

  // Anyone who fell out of the top N stops shouting.
  await Notification.updateMany(
    { type: "attrition_risk", dedupeKey: { $nin: keepKeys } },
    { $set: { dismissed: true } }
  );

  return keepKeys.length;
}

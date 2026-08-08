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

/**
 * Module 3 returns categorical counterfactuals in the model's ENCODED space —
 * OverTime comes back as 1 → 0 — while both the employee record and `/infer`
 * use the label. Stored raw, an overtime plan could never be applied: the
 * allow-list rejected "0", and writing 0 onto the employee made the next
 * inference fail validation with a 422. OverTime is the only categorical the
 * counterfactual engine actually proposes, so it is the only one mapped here.
 */
const CATEGORICAL_LABELS = {
  OverTime: { 0: "No", 1: "Yes" },
};

export function decodeFeatureValue(feature, value) {
  const map = CATEGORICAL_LABELS[feature];
  if (!map || value == null) return value;
  if (typeof value === "string" && Object.values(map).includes(value)) return value; // already a label
  return map[Number(value)] ?? value;
}

/**
 * Re-scores every plan by running the real model on the counterfactual state.
 *
 * The `new_attrition_prob` module 3 ships with a plan is its own estimate, and
 * measured against the model it is consistently pessimistic — across the stored
 * plans it overshoots by 16 points on average and by as much as 73. Applying a
 * plan runs the model for real, so the two never agreed. This runs that same
 * computation up front, without writing anything, so the number on screen is
 * the number applying it will produce.
 *
 * Best-effort: a plan that cannot be scored keeps module 3's estimate.
 */
export async function verifyPlans(employee, plans) {
  const byIndex = new Map();
  for (const plan of plans) {
    if (!byIndex.has(plan.cf_index)) byIndex.set(plan.cf_index, []);
    byIndex.get(plan.cf_index).push(plan);
  }

  const base = buildFeaturePayload(employee);
  const scored = await Promise.all(
    [...byIndex.entries()].map(async ([cfIndex, group]) => {
      const payload = { ...base };
      for (const change of group) {
        const current = base[change.feature_changed];
        const value = decodeFeatureValue(change.feature_changed, change.suggested_value);
        payload[change.feature_changed] = typeof current === "number" ? Number(value) : value;
      }
      try {
        const result = await inferAttrition(payload);
        return [cfIndex, Number(result.attrition_prob ?? 0)];
      } catch {
        return [cfIndex, null];
      }
    })
  );

  return new Map(scored);
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

  /**
   * `baseline_probability` may appear in $set OR $setOnInsert, never both.
   *
   * MongoDB rejects an update document that touches the same path twice —
   * "Updating the path 'baseline_probability' would create a conflict" — and it
   * checks that statically, whether or not the upsert actually inserts. Every
   * live intervention passes a baseline, so this threw on every apply: the
   * employee record had already been changed and the model had already re-run,
   * but the prediction was never written and the request 500'd. The change only
   * appeared after a page refresh, when the panel re-ran inference against the
   * already-updated employee.
   */
  const predictionWrite = { $set: predictionUpdate };
  if (inc) predictionWrite.$inc = inc;
  if (predictionUpdate.baseline_probability === undefined) {
    predictionWrite.$setOnInsert = { baseline_probability: prob };
  }

  await Prediction.updateOne({ EmployeeNumber: employeeNumber }, predictionWrite, { upsert: true });

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
  //
  // The whole set goes, not just the un-applied rows. Keeping the applied ones
  // used to leave counterfactuals from before an intervention sitting next to
  // the fresh ones, so the UI offered an "Apply live" button for a change the
  // employee record had already moved past — which the route then rejected with
  // "<feature> is already <value> — nothing to apply." The audit trail lives in
  // attrition_events, so nothing is lost by rebuilding this collection.
  const previouslyApplied = await Intervention.find({ EmployeeNumber: employeeNumber, applied: true }).lean();
  const appliedKeys = new Set(previouslyApplied.map((i) => `${i.feature_changed}|${i.suggested_value}`));

  await Intervention.deleteMany({ EmployeeNumber: employeeNumber });
  // `feature_label` is not always present on a counterfactual, which rendered
  // as a bare ": 4 → 1" in the plan list. SHAP carries a readable label for the
  // same column, so borrow it, and fall back to the column name.
  const shapLabels = new Map((result.shap_top5 || []).map((s) => [s.feature, s.feature_label]));
  const plans = (result.dice_plans || []).map((p) => ({
    ...p,
    feature_label: p.feature_label || shapLabels.get(p.feature_changed) || p.feature_changed,
    current_value: decodeFeatureValue(p.feature_changed, p.current_value),
    suggested_value: decodeFeatureValue(p.feature_changed, p.suggested_value),
  }));

  if (plans.length) {
    // Score each plan against the real model before storing it, so what the UI
    // advertises and what applying produces are the same number.
    const employee = await Employee.findOne({ EmployeeNumber: employeeNumber }).lean();
    const verified = employee ? await verifyPlans(employee, plans).catch(() => new Map()) : new Map();

    await Intervention.insertMany(
      plans.map((p) => {
        const verifiedProb = verified.get(p.cf_index);
        return {
          EmployeeNumber: employeeNumber,
          cf_index: p.cf_index,
          feature_changed: p.feature_changed,
          feature_label: p.feature_label,
          current_value: p.current_value,
          suggested_value: p.suggested_value,
          new_attrition_prob: p.new_attrition_prob,
          risk_reduction: p.risk_reduction,
          verified_prob: verifiedProb ?? null,
          verified_at: verifiedProb != null ? new Date() : null,
          intervention_label: p.intervention_label,
          applied: appliedKeys.has(`${p.feature_changed}|${p.suggested_value}`),
          computed_at: new Date(),
          source,
        };
      }),
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
    // Prefer the model-verified probability over module 3's own estimate, and
    // derive the reduction from it so the two figures cannot disagree.
    dice_plans: (dice || []).map((d) => {
      const newProb = d.verified_prob ?? d.new_attrition_prob;
      return {
        cf_index: d.cf_index,
        feature_changed: d.feature_changed,
        feature_label: d.feature_label || d.feature_changed,
        current_value: decodeFeatureValue(d.feature_changed, d.current_value),
        suggested_value: decodeFeatureValue(d.feature_changed, d.suggested_value),
        new_attrition_prob: newProb,
        risk_reduction:
          d.verified_prob != null ? Number((prob - d.verified_prob).toFixed(4)) : d.risk_reduction,
        verified: d.verified_prob != null,
        intervention_label: d.intervention_label,
        applied: !!d.applied,
        applied_at: d.applied_at || null,
      };
    }),
    // Provenance so the UI can show "cached • 2 min ago" without guessing.
    _cached: true,
    _computed_at: pred.computed_at || pred.updatedAt || null,
    _source: pred.source || "live",
    _baseline_probability: pred.baseline_probability ?? null,
    _interventions_applied: pred.interventions_applied ?? 0,
  };
}

/**
 * Tops up plans stored before verification existed.
 *
 * Runs at most once per employee: the moment every plan carries a
 * `verified_prob` this returns immediately. Failures are swallowed — an
 * unverified plan simply keeps module 3's estimate rather than blocking the
 * panel from loading.
 */
export async function ensurePlansVerified(employeeNumber) {
  const stored = await Intervention.find({ EmployeeNumber: employeeNumber }).lean();
  if (!stored.length || stored.every((d) => d.verified_prob != null)) return;

  const employee = await Employee.findOne({ EmployeeNumber: employeeNumber }).lean();
  if (!employee) return;

  const verified = await verifyPlans(employee, stored).catch(() => new Map());
  await Promise.all(
    [...verified.entries()]
      .filter(([, prob]) => prob != null)
      .map(([cfIndex, prob]) =>
        Intervention.updateMany(
          { EmployeeNumber: employeeNumber, cf_index: cfIndex },
          { $set: { verified_prob: prob, verified_at: new Date() } }
        )
      )
  );
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
    await ensurePlansVerified(employee.EmployeeNumber).catch(() => {});
    const cached = await readCachedAnalysis(employee.EmployeeNumber);
    if (cached) return cached;
  }
  const result = await inferAttrition(buildFeaturePayload(employee));
  await persistInference(employee.EmployeeNumber, result, { source });
  await refreshAttritionNotifications().catch(() => {});
  // Read back rather than returning the raw model result, so the caller gets
  // the verified plan probabilities that were just stored.
  const stored = await readCachedAnalysis(employee.EmployeeNumber);
  return { ...(stored || result), _cached: false, _computed_at: new Date(), _source: source };
}

/**
 * LIVE ATTRITION: writes a counterfactual back onto the employee, re-runs the
 * real model on the changed record, and persists the new probability.
 *
 * `feature` must be a real IBM HR column; the caller (routes/attrition.js)
 * validates it against the mutable-feature allow-list first.
 */
export async function applyIntervention(employee, { feature, value, cfIndex, interventionLabel, actor }) {
  return applyChanges(employee, {
    changes: [{ feature, value }],
    cfIndex,
    label: interventionLabel,
    actor,
  });
}

/**
 * Applies one or many counterfactual changes as a single step.
 *
 * A whole DiCE plan moves more than one feature, and the only honest way to
 * score it is to write every change first and re-run the model ONCE on the
 * result. Applying them one at a time would re-run the model per feature and
 * report intermediate probabilities that no plan ever predicted — Plan A's
 * "7.6% after" is the probability once BOTH of its actions are in place.
 */
export async function applyChanges(employee, { changes, cfIndex = null, label = "", actor }) {
  const before = await readCachedAnalysis(employee.EmployeeNumber);
  const probBefore = before?.attrition_prob ?? null;

  // 1. Mutate the employee record — one write, all features (the real change).
  const $set = { lastInterventionAt: new Date() };
  for (const { feature, value } of changes) $set[feature] = value;
  await Employee.updateOne({ EmployeeNumber: employee.EmployeeNumber }, { $set });
  const updated = await Employee.findOne({ EmployeeNumber: employee.EmployeeNumber }).lean();

  // 2. Re-run the untouched module-3 model on the changed record.
  const result = await inferAttrition(buildFeaturePayload(updated));
  const probAfter = Number(result.attrition_prob ?? 0);

  const labelFor = (feature) =>
    (before?.dice_plans || []).find((p) => p.feature_changed === feature)?.feature_label ||
    result.shap_top5?.find((s) => s.feature === feature)?.feature_label ||
    feature;

  const applied = changes.map(({ feature, value }) => ({
    feature,
    feature_label: labelFor(feature),
    from_value: employee[feature],
    to_value: value,
  }));
  const summary = applied.map((c) => `${c.feature_label}: ${c.from_value} → ${c.to_value}`).join(" · ");
  const head = applied[0];

  // 3. Persist the new prediction / SHAP / DiCE set.
  await persistInference(employee.EmployeeNumber, result, {
    source: "intervention",
    baselineProbability: before?._baseline_probability ?? probBefore ?? probAfter,
    lastIntervention: {
      feature: head.feature,
      feature_label: applied.length > 1 ? label || `${applied.length} changes` : head.feature_label,
      from_value: head.from_value,
      to_value: head.to_value,
      applied_at: new Date(),
      applied_by: actor?.clerkUserId || "system",
    },
  });

  // 4. Mark every matching DiCE row as applied.
  for (const change of applied) {
    await Intervention.updateMany(
      {
        EmployeeNumber: employee.EmployeeNumber,
        feature_changed: change.feature,
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

  // 5. Immutable audit trail — one event for the step, listing every change.
  const event = await AttritionEvent.create({
    EmployeeNumber: employee.EmployeeNumber,
    employeeName: employee.name,
    action: "intervention_applied",
    feature: head.feature,
    feature_label: head.feature_label,
    from_value: head.from_value,
    to_value: head.to_value,
    changes: applied,
    planLabel: applied.length > 1 ? label || "Plan" : "",
    cf_index: cfIndex ?? null,
    intervention_label: label || summary,
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
      body: `${summary}. Attrition probability ${(probBefore * 100).toFixed(1)}% → ${(probAfter * 100).toFixed(1)}%.`,
      audienceRole: "admin",
      entity: { kind: "employee", id: String(employee.EmployeeNumber), label: employee.name || "" },
      actionView: "employees",
      actionId: employee.id || String(employee.EmployeeNumber),
      meta: { probBefore, probAfter, changes: applied.map((c) => c.feature) },
    }).catch(() => {});
  }

  await refreshAttritionNotifications().catch(() => {});

  // Read the analysis back out of MongoDB rather than returning the in-memory
  // result: what the caller renders is then provably what was stored, which is
  // what makes the panel correct without a page refresh.
  const stored = await readCachedAnalysis(employee.EmployeeNumber);

  return {
    ...(stored || result),
    _cached: false,
    _computed_at: new Date(),
    _source: "intervention",
    _applied: {
      feature: head.feature,
      feature_label: head.feature_label,
      from_value: head.from_value,
      to_value: head.to_value,
      changes: applied,
      label: label || summary,
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

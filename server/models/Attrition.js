/**
 * Module 3 analysis collections — `predictions`, `shap_explanations`,
 * `interventions` — plus the new `attrition_events` audit trail.
 *
 * The first three keep your teammate's EXACT field names (flat
 * shap_feature_1..5 / shap_value_1..5, reason_prob_* etc.) because his
 * FastAPI helpers `build_shap_top5`, `build_reason_probs` and
 * `build_dice_plans` read those literal keys. Extra fields are additive only.
 */
import mongoose from "mongoose";

// ── predictions ─────────────────────────────────────────────────────────────
const predictionSchema = new mongoose.Schema(
  {
    EmployeeNumber: { type: Number, required: true, unique: true, index: true },

    // teammate's fields
    attrition_probability: { type: Number, default: 0 },
    attrition_verdict: { type: String, default: "No" }, // "Yes" | "No"
    risk_tier: { type: String, default: "Low", index: true }, // Low|Medium|High|Critical
    primary_reason: { type: String, default: "N/A" },
    reason_prob_burnout: { type: Number, default: 0 },
    reason_prob_compensation: { type: Number, default: 0 },
    reason_prob_stagnation: { type: Number, default: 0 },
    reason_prob_career_growth: { type: Number, default: 0 },

    // additive: provenance + live-intervention bookkeeping
    attrition_pct: { type: Number, default: 0 },
    baseline_probability: Number, // probability before any live intervention
    source: { type: String, default: "live", enum: ["seed", "live", "intervention", "precompute"] },
    computed_at: { type: Date, default: Date.now, index: true },
    model_version: String,
    interventions_applied: { type: Number, default: 0 },
    last_intervention: {
      feature: String,
      feature_label: String,
      from_value: mongoose.Schema.Types.Mixed,
      to_value: mongoose.Schema.Types.Mixed,
      applied_at: Date,
      applied_by: String,
    },
  },
  { timestamps: true, collection: "predictions", strict: false, minimize: false }
);
predictionSchema.index({ attrition_probability: -1 });
predictionSchema.index({ risk_tier: 1, attrition_probability: -1 });

export const Prediction = mongoose.model("Prediction", predictionSchema);

// ── shap_explanations ───────────────────────────────────────────────────────
const shapSchema = new mongoose.Schema(
  {
    EmployeeNumber: { type: Number, required: true, unique: true, index: true },
    base_value: { type: Number, default: 0 },

    // teammate's flat top-5 layout — required by his build_shap_top5()
    shap_feature_1: String,
    shap_value_1: Number,
    shap_feature_2: String,
    shap_value_2: Number,
    shap_feature_3: String,
    shap_value_3: Number,
    shap_feature_4: String,
    shap_value_4: Number,
    shap_feature_5: String,
    shap_value_5: Number,

    // additive: the rich array exactly as module 3 `/infer` returned it, so
    // the UI can render feature_label / raw_value / direction without a re-fetch
    shap_top5: {
      type: [
        {
          _id: false,
          rank: Number,
          feature: String,
          feature_label: String,
          shap_value: Number,
          raw_value: mongoose.Schema.Types.Mixed,
          direction: String, // "risk" | "protective"
        },
      ],
      default: [],
    },
    computed_at: { type: Date, default: Date.now },
    source: { type: String, default: "live" },
  },
  { timestamps: true, collection: "shap_explanations", strict: false, minimize: false }
);

export const ShapExplanation = mongoose.model("ShapExplanation", shapSchema);

// ── interventions (DiCE counterfactuals) ────────────────────────────────────
const interventionSchema = new mongoose.Schema(
  {
    EmployeeNumber: { type: Number, required: true, index: true },

    // teammate's fields
    cf_index: Number,
    feature_changed: String,
    feature_label: String,
    current_value: mongoose.Schema.Types.Mixed,
    suggested_value: mongoose.Schema.Types.Mixed,
    new_attrition_prob: Number,
    risk_reduction: Number,
    intervention_label: String,

    /**
     * The probability the real model returns for this counterfactual, measured
     * when the plan was stored. `new_attrition_prob` is module 3's own estimate
     * and runs consistently higher, so this is what the UI shows — applying the
     * plan performs the identical computation and lands on the same number.
     */
    verified_prob: Number,
    verified_at: Date,

    // additive: "LIVE attrition" bookkeeping
    applied: { type: Boolean, default: false, index: true },
    applied_at: Date,
    applied_by: String, // clerkUserId of the admin
    applied_by_email: String,
    realised_prob: Number, // probability the model actually returned after applying
    computed_at: { type: Date, default: Date.now },
    source: { type: String, default: "live" },
  },
  { timestamps: true, collection: "interventions", strict: false, minimize: false }
);
interventionSchema.index({ EmployeeNumber: 1, cf_index: 1, feature_changed: 1 });

export const Intervention = mongoose.model("Intervention", interventionSchema);

// ── attrition_events (new: immutable audit trail of live changes) ───────────
const attritionEventSchema = new mongoose.Schema(
  {
    EmployeeNumber: { type: Number, required: true, index: true },
    employeeName: String,
    action: {
      type: String,
      enum: ["intervention_applied", "recomputed", "reverted", "seeded"],
      default: "intervention_applied",
      index: true,
    },
    feature: String,
    feature_label: String,
    from_value: mongoose.Schema.Types.Mixed,
    to_value: mongoose.Schema.Types.Mixed,
    cf_index: Number,
    intervention_label: String,

    /**
     * Every change this event covers.
     *
     * A whole DiCE plan can be applied in one go, which moves several features
     * together and re-runs the model once — so one event describes N changes
     * and `prob_before`/`prob_after` belong to the batch, not to any single
     * feature. A single-feature apply writes a one-element array here too, so
     * reverting and the change-history list have one shape to read.
     */
    changes: {
      type: [
        {
          _id: false,
          feature: String,
          feature_label: String,
          from_value: mongoose.Schema.Types.Mixed,
          to_value: mongoose.Schema.Types.Mixed,
        },
      ],
      default: [],
    },
    planLabel: String,

    prob_before: Number,
    prob_after: Number,
    delta: Number, // prob_after - prob_before (negative = improvement)
    risk_tier_before: String,
    risk_tier_after: String,
    primary_reason_before: String,
    primary_reason_after: String,

    performedBy: String,
    performedByEmail: String,
    note: String,
  },
  { timestamps: true, collection: "attrition_events", minimize: false }
);
attritionEventSchema.index({ createdAt: -1 });

export const AttritionEvent = mongoose.model("AttritionEvent", attritionEventSchema);

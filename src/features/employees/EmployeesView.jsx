import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  ChevronDown,
  Filter,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Pill from "../../components/ui/Pill.jsx";
import SoftTag from "../../components/ui/SoftTag.jsx";
import { cx } from "../../lib/cx.js";

// ── API base URL (set VITE_API_URL in .env.local) ─────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRiskColors(tier) {
  if (tier === "Critical")
    return { header: "bg-rose-700", soft: "bg-rose-50 border-rose-200 text-rose-700", bar: "bg-rose-600" };
  if (tier === "High")
    return { header: "bg-rose-500", soft: "bg-rose-50 border-rose-200 text-rose-600", bar: "bg-rose-500" };
  if (tier === "Medium")
    return { header: "bg-amber-500", soft: "bg-amber-50 border-amber-200 text-amber-700", bar: "bg-amber-400" };
  return { header: "bg-emerald-600", soft: "bg-emerald-50 border-emerald-200 text-emerald-700", bar: "bg-emerald-500" };
}

function getPrimaryReasonColor(reason) {
  const map = {
    Burnout: "bg-rose-100 text-rose-700 border-rose-200",
    Compensation: "bg-amber-100 text-amber-700 border-amber-200",
    Stagnation: "bg-violet-100 text-violet-700 border-violet-200",
    "Career Growth": "bg-blue-100 text-blue-700 border-blue-200",
  };
  return map[reason] || "bg-slate-100 text-slate-600 border-slate-200";
}

function deptPill(d) {
  const map = {
    "Research & Development": "text-blue-700 bg-blue-50 border-blue-200",
    Sales:                    "text-emerald-700 bg-emerald-50 border-emerald-200",
    Engineering:              "text-indigo-700 bg-indigo-50 border-indigo-200",
    HR:                       "text-violet-700 bg-violet-50 border-violet-200",
    Marketing:                "text-pink-700 bg-pink-50 border-pink-200",
  };
  return map[d] || "text-slate-700 bg-slate-50 border-slate-200";
}

// Build a legacy "risk" string from risk_tier for the card badge
function tierToRiskLabel(tier) {
  if (tier === "Critical" || tier === "High") return "High";
  if (tier === "Medium") return "Medium";
  return "Low";
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
function EmployeesView({ employees, search, setSearch }) {
  const [dept, setDept]             = useState("All Department");
  const [riskFilter, setRiskFilter] = useState("All Risk");
  const [mode, setMode]             = useState("All Mode");
  const [selectedId, setSelectedId] = useState(null);

  // Live inference state
  const [analysis,  setAnalysis]  = useState(null);  // result from /infer
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  // Filter employees
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const qOk = !q || `${e.name} ${e.JobRole} ${e.email}`.toLowerCase().includes(q);
      const dOk = dept      === "All Department" || e.Department  === dept;
      const mOk = mode      === "All Mode"       || e.workMode    === mode;
      // riskFilter compares against verdicts from analysis if available; skip for now at list level
      return qOk && dOk && mOk;
    });
  }, [employees, search, dept, mode]);

  // Deselect if filtered out
  useEffect(() => {
    if (selectedId && !filtered.find((x) => x.id === selectedId)) {
      setSelectedId(null);
      setAnalysis(null);
    }
  }, [filtered, selectedId]);

  const selectedEmployee = filtered.find((x) => x.id === selectedId) || null;

  // ── Fetch inference when employee is selected ──────────────────────────────
  async function handleSelectEmployee(e) {
    setSelectedId(e.id);
    setAnalysis(null);
    setError(null);
    setLoading(true);

    // Build the raw feature payload (all IBM HR columns)
    const payload = {
      EmployeeNumber:          e.EmployeeNumber,
      Age:                     e.Age,
      BusinessTravel:          e.BusinessTravel,
      DailyRate:               e.DailyRate,
      Department:              e.Department,
      DistanceFromHome:        e.DistanceFromHome,
      Education:               e.Education,
      EducationField:          e.EducationField,
      EmployeeCount:           e.EmployeeCount ?? 1,
      EnvironmentSatisfaction: e.EnvironmentSatisfaction,
      Gender:                  e.Gender,
      HourlyRate:              e.HourlyRate,
      JobInvolvement:          e.JobInvolvement,
      JobLevel:                e.JobLevel,
      JobRole:                 e.JobRole,
      JobSatisfaction:         e.JobSatisfaction,
      MaritalStatus:           e.MaritalStatus,
      MonthlyIncome:           e.MonthlyIncome,
      MonthlyRate:             e.MonthlyRate,
      NumCompaniesWorked:      e.NumCompaniesWorked,
      Over18:                  e.Over18 ?? "Y",
      OverTime:                e.OverTime,
      PercentSalaryHike:       e.PercentSalaryHike,
      PerformanceRating:       e.PerformanceRating,
      RelationshipSatisfaction:e.RelationshipSatisfaction,
      StandardHours:           e.StandardHours ?? 80,
      StockOptionLevel:        e.StockOptionLevel,
      TotalWorkingYears:       e.TotalWorkingYears,
      TrainingTimesLastYear:   e.TrainingTimesLastYear,
      WorkLifeBalance:         e.WorkLifeBalance,
      YearsAtCompany:          e.YearsAtCompany,
      YearsInCurrentRole:      e.YearsInCurrentRole,
      YearsSinceLastPromotion: e.YearsSinceLastPromotion,
      YearsWithCurrManager:    e.YearsWithCurrManager,
    };

    try {
      const res = await fetch(`${API_URL}/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      setAnalysis(data);
    } catch (err) {
      setError(err.message || "Failed to reach inference API. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  // ── Sub-components ────────────────────────────────────────────────────────
  const InfoRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 text-right">{value}</div>
    </div>
  );

  const EmployeeCard = ({ e }) => {
    // Risk badge color is neutral until analysis arrives
    return (
      <button
        onClick={() => handleSelectEmployee(e)}
        className="text-left rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50"
      >
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold">
            {e.initials}
          </div>
          <div className="flex-1">
            <div className="text-lg font-bold text-slate-900">{e.name}</div>
            <div className="text-sm text-slate-500">{e.JobRole}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm", deptPill(e.Department))}>
                <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                {e.Department}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                <Calendar className="h-4 w-4" /> {e.joined}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-600">
                {e.workMode}
              </span>
            </div>
          </div>
        </div>
      </button>
    );
  };

  // ── Groups DiCE records by cf_index → [{index, label, changes[], new_prob, reduction}]
  function groupDicePlans(dicePlans) {
    const byIndex = {};
    for (const rec of (dicePlans || [])) {
      const idx = rec.cf_index;
      if (!byIndex[idx]) {
        byIndex[idx] = {
          cf_index:       idx,
          new_prob:       rec.new_attrition_prob,
          risk_reduction: rec.risk_reduction,
          changes:        [],
        };
      }
      byIndex[idx].changes.push(rec);
    }
    return Object.values(byIndex).sort((a, b) => b.risk_reduction - a.risk_reduction);
  }

  // ── Detail Panel ──────────────────────────────────────────────────────────
  const renderDetailPanel = () => {
    const emp = selectedEmployee;
    if (!emp) return null;

    // Determine risk colors: use analysis if available, else neutral
    const tier   = analysis ? analysis.risk_tier : "Low";
    const colors = getRiskColors(tier);
    const pct    = analysis ? analysis.attrition_pct : null;

    const plans = analysis ? groupDicePlans(analysis.dice_plans) : [];

    // Plan labels
    const planNames = ["Plan A", "Plan B", "Plan C"];
    const planTagColors = [
      "bg-indigo-50 text-indigo-700 border-indigo-200",
      "bg-sky-50 text-sky-700 border-sky-200",
      "bg-violet-50 text-violet-700 border-violet-200",
    ];

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setSelectedId(null); setAnalysis(null); setError(null); }}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ArrowRight className="h-4 w-4 rotate-180" /> Back
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          {/* LEFT: profile */}
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-indigo-200 to-sky-200 border border-slate-200 flex items-center justify-center text-2xl font-bold text-indigo-700">
                {emp.initials}
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-slate-900">{emp.name}</div>
                <div className="text-sm text-slate-500 mt-1">{emp.JobRole}</div>
                <div className="text-xs text-slate-400 mt-1">{emp.email}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm", deptPill(emp.Department))}>
                    <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                    {emp.Department}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                    <Calendar className="h-4 w-4" /> {emp.joined}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
                    {emp.workMode}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Employee Info</div>
              <InfoRow label="Location"         value={emp.location} />
              <InfoRow label="Manager"           value={emp.manager} />
              <InfoRow label="Monthly Income"   value={`$${emp.MonthlyIncome?.toLocaleString()}`} />
              <InfoRow label="Tenure"            value={`${emp.YearsAtCompany} years`} />
              <InfoRow label="Last Promotion"   value={emp.lastPromotion} />
              <InfoRow label="Overtime"          value={emp.OverTime} />
              <InfoRow label="Work-Life Balance" value={`${emp.WorkLifeBalance}/4`} />
              <InfoRow label="Job Satisfaction"  value={`${emp.JobSatisfaction}/4`} />
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Skills</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(emp.skills || []).map((s) => (
                  <SoftTag key={s}>{s}</SoftTag>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: AI analysis */}
          <div className="space-y-4">

            {/* Loading state */}
            {loading && (
              <div className="rounded-3xl border border-slate-200 bg-white p-10 flex flex-col items-center justify-center gap-3 shadow-sm">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <div className="text-sm text-slate-600 font-medium">Running AI inference…</div>
                <div className="text-xs text-slate-400">XGBoost → SHAP → DiCE</div>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-sm">
                <div className="text-sm font-semibold text-rose-700 mb-1">Inference failed</div>
                <div className="text-xs text-rose-600">{error}</div>
                <div className="mt-3 text-xs text-rose-500">
                  Make sure the backend is running at: <code className="bg-rose-100 px-1 rounded">{API_URL}</code>
                </div>
              </div>
            )}

            {/* Results */}
            {analysis && !loading && !error && (
              <>
                {/* Risk Header */}
                <div className={cx("rounded-3xl p-5 text-white shadow-sm", colors.header)}>
                  <div className="text-sm opacity-90">Attrition Risk Score</div>
                  <div className="mt-1 text-4xl font-extrabold tracking-tight">
                    {pct?.toFixed(1)}%
                  </div>
                  <div className="mt-1 text-sm text-white/80 font-medium">
                    Risk Level: {analysis.risk_tier}
                  </div>
                  {analysis.primary_reason && analysis.primary_reason !== "N/A" && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-sm">
                      <Zap className="h-3.5 w-3.5" />
                      Primary driver: <span className="font-bold">{analysis.primary_reason}</span>
                    </div>
                  )}
                  <div className="mt-4 h-2 rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-700"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 text-xs text-white/70">Company baseline: ~16%</div>
                </div>

                {/* Reason probabilities */}
                {analysis.reason_probs && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-base font-bold text-slate-900 mb-3">Attrition Reason Likelihood</div>
                    <div className="space-y-2">
                      {Object.entries(analysis.reason_probs)
                        .sort(([, a], [, b]) => b - a)
                        .map(([reason, prob]) => {
                          const pctReason = (prob * 100).toFixed(1);
                          return (
                            <div key={reason} className="flex items-center gap-3">
                              <div className="w-28 text-xs text-slate-600 shrink-0">{reason}</div>
                              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-indigo-400 transition-all duration-500"
                                  style={{ width: `${pctReason}%` }}
                                />
                              </div>
                              <div className="w-12 text-right text-xs font-mono text-slate-700">{pctReason}%</div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* SHAP Top-5 */}
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-base font-bold text-slate-900">Key Risk Drivers</div>
                  <div className="text-xs text-slate-500 mt-1 mb-4">
                    Top-5 SHAP feature attributions — how each factor pushes this employee's risk score.
                  </div>
                  <div className="space-y-3">
                    {(analysis.shap_top5 || []).map((item) => {
                      const absVal   = Math.abs(item.shap_value);
                      const maxVal   = 1.5; // rough normaliser for bar width
                      const barWidth = Math.min((absVal / maxVal) * 100, 100);
                      const isRisk   = item.direction === "risk";
                      return (
                        <div key={item.rank} className={cx(
                          "rounded-2xl border px-4 py-3",
                          isRisk ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"
                        )}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{item.feature_label}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Current value: {item.raw_value}</div>
                            </div>
                            <div className={cx(
                              "inline-flex items-center gap-1 text-sm font-mono font-bold",
                              isRisk ? "text-rose-700" : "text-emerald-700"
                            )}>
                              {isRisk
                                ? <TrendingUp className="h-4 w-4" />
                                : <TrendingDown className="h-4 w-4" />
                              }
                              {isRisk ? "+" : ""}{item.shap_value.toFixed(3)}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/60 overflow-hidden">
                            <div
                              className={cx("h-full rounded-full transition-all duration-500",
                                isRisk ? "bg-rose-500" : "bg-emerald-500"
                              )}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {isRisk ? "⬆ Increases attrition risk" : "⬇ Reduces attrition risk"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* DiCE Intervention Plans */}
                {plans.length > 0 && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-base font-bold text-slate-900">Intervention Plans</div>
                    <div className="text-xs text-slate-500 mt-1 mb-4">
                      Counterfactual scenarios — what HR can do to reduce this employee's attrition risk.
                    </div>
                    <div className="space-y-3">
                      {plans.map((plan, idx) => {
                        const planName = planNames[idx] || `Plan ${plan.cf_index}`;
                        const tagColor = planTagColors[idx] || planTagColors[0];
                        return (
                          <div key={plan.cf_index} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-2">
                                <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", tagColor)}>
                                  {planName}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {plan.changes.length} action{plan.changes.length > 1 ? "s" : ""}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-slate-500">Predicted risk after</div>
                                <div className="text-sm font-bold text-slate-900">
                                  {(plan.new_prob * 100).toFixed(1)}%
                                </div>
                                <div className="text-xs text-emerald-700 font-semibold">
                                  ↓ -{(plan.risk_reduction * 100).toFixed(1)}%
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              {plan.changes.map((chg, ci) => (
                                <div key={ci} className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                  <div className="text-sm text-slate-800 font-medium">{chg.intervention_label}</div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {chg.feature_label}: {chg.current_value} → {chg.suggested_value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* No interventions if risk is already Low */}
                {plans.length === 0 && analysis.risk_tier === "Low" && (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                    <div className="text-base font-bold text-emerald-800">Low Attrition Risk ✓</div>
                    <div className="text-sm text-emerald-700 mt-1">
                      This employee is below the high-risk threshold. No urgent interventions required — continue standard engagement.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-b from-white to-slate-50 p-6">
        {!selectedEmployee ? (
          <>
            {/* Filters */}
            <div className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-start gap-3">
                <button
                  className="inline-flex min-w-[160px] items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  onClick={() => setDept((d) => d === "All Department" ? "Sales" : "All Department")}
                >
                  <Filter className="h-4 w-4 text-slate-500" />
                  {dept}
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  onClick={() => setMode((m) => m === "All Mode" ? "Hybrid" : "All Mode")}
                >
                  <Users className="h-4 w-4 text-slate-500" />
                  {mode}
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="mt-6">
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((e) => (
                  <EmployeeCard key={e.id} e={e} />
                ))}
              </div>
            </div>
          </>
        ) : (
          renderDetailPanel()
        )}
      </div>
    </div>
  );
}

export default EmployeesView;

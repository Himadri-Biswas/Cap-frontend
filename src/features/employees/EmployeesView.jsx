import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Database,
  Filter,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Pill from "../../components/ui/Pill.jsx";
import SoftTag from "../../components/ui/SoftTag.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";

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

function relativeTime(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * A DiCE counterfactual only tells us the target VALUE. To apply it live we
 * need the raw column name too — module 3 already returns `feature_changed`,
 * so this just coerces the suggested value into the type the model expects.
 */
function coerceSuggested(change) {
  const raw = change.suggested_value;
  if (typeof raw === "number") return raw;
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) && String(raw).trim() !== "" ? asNumber : raw;
}

// ── Dropdown used by the filter bar ──────────────────────────────────────────
function Dropdown({ icon: Icon, value, options, onChange, minWidth = 160 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ minWidth }}
        className={cx(
          "inline-flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-sm transition",
          open ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="truncate">{value}</span>
        </span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 text-slate-500 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-xl">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={cx(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                option === value ? "bg-indigo-50 font-semibold text-indigo-700" : "text-slate-700 hover:bg-slate-50"
              )}
            >
              <span className="truncate">{option}</span>
              {option === value && <CheckCircle2 className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
function EmployeesView({ employees, search, setSearch, focusId = null, onEmployeesChanged }) {
  const [dept, setDept]             = useState("All Department");
  const [riskFilter, setRiskFilter] = useState("All Risk");
  const [mode, setMode]             = useState("All Mode");
  const [selectedId, setSelectedId] = useState(null);

  // Live inference state
  const [analysis,  setAnalysis]  = useState(null);  // result from /infer
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);

  // Live-intervention state (module 3 "LIVE attrition")
  const [applying, setApplying]     = useState(null);  // feature currently being applied
  const [applyError, setApplyError] = useState(null);
  const [lastApplied, setLastApplied] = useState(null);
  const [history, setHistory]       = useState([]);
  const [reverting, setReverting]   = useState(false);

  // Filter option lists, derived from whatever MongoDB actually returned
  const departments = useMemo(
    () => ["All Department", ...[...new Set(employees.map((e) => e.Department).filter(Boolean))].sort()],
    [employees]
  );
  const workModes = useMemo(
    () => ["All Mode", ...[...new Set(employees.map((e) => e.workMode).filter(Boolean))].sort()],
    [employees]
  );
  const riskTiers = ["All Risk", "Critical", "High", "Medium", "Low"];

  // Filter employees
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => {
      const qOk = !q || `${e.name} ${e.JobRole} ${e.email}`.toLowerCase().includes(q);
      const dOk = dept      === "All Department" || e.Department  === dept;
      const mOk = mode      === "All Mode"       || e.workMode    === mode;
      // risk_tier is the cached prediction MongoDB attached to each row
      const rOk = riskFilter === "All Risk"      || e.risk_tier   === riskFilter;
      return qOk && dOk && mOk && rOk;
    });
  }, [employees, search, dept, mode, riskFilter]);

  // Deselect if filtered out
  useEffect(() => {
    if (selectedId && !filtered.find((x) => x.id === selectedId)) {
      setSelectedId(null);
      setAnalysis(null);
    }
  }, [filtered, selectedId]);

  const selectedEmployee = filtered.find((x) => x.id === selectedId) || null;

  // A notification deep-link ("open employee #123") lands here.
  const focusHandled = useRef(null);
  useEffect(() => {
    if (!focusId || focusHandled.current === focusId || !employees.length) return;
    const match = employees.find(
      (e) => e.id === focusId || String(e.EmployeeNumber) === String(focusId)
    );
    if (match) {
      focusHandled.current = focusId;
      setDept("All Department");
      setMode("All Mode");
      setRiskFilter("All Risk");
      handleSelectEmployee(match);
    }
  }, [focusId, employees]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch inference when employee is selected ──────────────────────────────
  /**
   * `live=false` (the default) reads the prediction MongoDB already cached, so
   * opening an employee is instant. `live=true` runs the untouched module-3
   * `/infer` call below — same URL, same payload as before — and writes the
   * fresh result back into the cache.
   */
  async function handleSelectEmployee(e, { live = false } = {}) {
    setSelectedId(e.id);
    setAnalysis(null);
    setError(null);
    setApplyError(null);
    setLastApplied(null);
    setLoading(true);

    api.employees
      .events(e.EmployeeNumber)
      .then((data) => setHistory(data.events || []))
      .catch(() => setHistory([]));

    // ── Cached path ────────────────────────────────────────────────────────
    if (!live) {
      try {
        const cached = await api.attrition.get(e.EmployeeNumber);
        if (cached) {
          setAnalysis(cached);
          setLoading(false);
          return;
        }
      } catch {
        // No cached analysis yet — fall through to live inference.
      }
    }

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
      // Cache it so the next open (and the top-5 alert) has real numbers.
      api.employees.saveAnalysis(e.EmployeeNumber, data).catch(() => {});
    } catch (err) {
      setError(err.message || "Failed to reach inference API. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  /**
   * LIVE ATTRITION — the admin acts on a counterfactual.
   *
   * The server writes the new value onto the employee, re-runs the real
   * module-3 model, stores the new probability in MongoDB Atlas and returns a
   * standard `/infer`-shaped payload, which drops straight back into
   * `analysis` — so every panel below re-renders from freshly stored numbers.
   */
  async function handleApplyIntervention(change, plan) {
    if (!selectedEmployee) return;
    const feature = change.feature_changed;
    setApplying(feature);
    setApplyError(null);
    try {
      const result = await api.attrition.apply(selectedEmployee.EmployeeNumber, {
        feature,
        value: coerceSuggested(change),
        cfIndex: plan?.cf_index ?? null,
        interventionLabel: change.intervention_label,
      });
      setAnalysis(result);
      setLastApplied(result._applied || null);
      api.employees
        .events(selectedEmployee.EmployeeNumber)
        .then((data) => setHistory(data.events || []))
        .catch(() => {});
      onEmployeesChanged?.();
    } catch (err) {
      setApplyError(err.message || "Could not apply this intervention.");
    } finally {
      setApplying(null);
    }
  }

  async function handleRevert() {
    if (!selectedEmployee) return;
    setReverting(true);
    setApplyError(null);
    try {
      const result = await api.attrition.revert(selectedEmployee.EmployeeNumber);
      setAnalysis(result);
      setLastApplied(result._applied || null);
      api.employees
        .events(selectedEmployee.EmployeeNumber)
        .then((data) => setHistory(data.events || []))
        .catch(() => {});
      onEmployeesChanged?.();
    } catch (err) {
      setApplyError(err.message || "Could not revert.");
    } finally {
      setReverting(false);
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
    const tier = e.risk_tier;
    const colors = tier ? getRiskColors(tier) : null;
    return (
      <button
        onClick={() => handleSelectEmployee(e)}
        className="text-left rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:bg-slate-50 hover:shadow-md"
      >
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold">
            {e.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-lg font-bold text-slate-900">{e.name}</div>
                <div className="truncate text-sm text-slate-500">{e.JobRole}</div>
              </div>
              {/* Cached risk badge — no ML call needed to render the grid */}
              {tier ? (
                <span
                  className={cx(
                    "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
                    colors.soft
                  )}
                  title={`Attrition risk: ${e.attrition_pct}%`}
                >
                  {e.attrition_pct != null ? `${Math.round(e.attrition_pct)}%` : tierToRiskLabel(tier)}
                </span>
              ) : (
                <span
                  className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-400"
                  title="No prediction cached yet — open to run inference"
                >
                  —
                </span>
              )}
            </div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => { setSelectedId(null); setAnalysis(null); setError(null); setLastApplied(null); }}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ArrowRight className="h-4 w-4 rotate-180" /> Back
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {analysis?._cached && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-500">
                <Database className="h-3.5 w-3.5" />
                Cached {relativeTime(analysis._computed_at)}
              </span>
            )}
            {history.some((h) => h.action === "intervention_applied") && (
              <button
                onClick={handleRevert}
                disabled={reverting}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {reverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Undo last change
              </button>
            )}
            <button
              onClick={() => handleSelectEmployee(emp, { live: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Re-run model
            </button>
          </div>
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
              <InfoRow label="Distance From Home" value={`${emp.DistanceFromHome} km`} />
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

            {/* Live-change history, straight from attrition_events */}
            {history.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700">
                  <History className="h-3.5 w-3.5" />
                  Change history
                </div>
                <div className="mt-3 space-y-2">
                  {history.slice(0, 6).map((event) => {
                    const improved = event.delta != null && event.delta < 0;
                    return (
                      <div key={event._id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-800">
                            {event.feature_label}: {String(event.from_value)} → {String(event.to_value)}
                          </div>
                          {event.delta != null && (
                            <div
                              className={cx(
                                "shrink-0 text-xs font-bold",
                                improved ? "text-emerald-600" : "text-rose-600"
                              )}
                            >
                              {improved ? "↓" : "↑"} {Math.abs(event.delta * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {(event.prob_before * 100).toFixed(1)}% → {(event.prob_after * 100).toFixed(1)}% ·{" "}
                          {relativeTime(event.createdAt)}
                          {event.performedByEmail ? ` · ${event.performedByEmail}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
                <div className={cx("rounded-3xl p-5 text-white shadow-sm transition-colors duration-500", colors.header)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm opacity-90">Attrition Risk Score</div>
                    {analysis._interventions_applied > 0 && (
                      <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold">
                        {analysis._interventions_applied} intervention
                        {analysis._interventions_applied > 1 ? "s" : ""} applied
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-4xl font-extrabold tracking-tight">
                    {pct?.toFixed(1)}%
                  </div>
                  <div className="mt-1 text-sm text-white/80 font-medium">
                    Risk Level: {analysis.risk_tier}
                  </div>

                  <div className="mt-4 h-2 rounded-full bg-white/30 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-white transition-all duration-700"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-white/70">
                    <span>Company baseline: ~16%</span>
                    {analysis._baseline_probability != null &&
                      Math.abs(analysis._baseline_probability - analysis.attrition_prob) > 0.001 && (
                        <span className="font-semibold text-white/90">
                          was {(analysis._baseline_probability * 100).toFixed(1)}%
                        </span>
                      )}
                  </div>
                </div>

                {/* Live intervention outcome banner */}
                {lastApplied && (
                  <div className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <Zap className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-emerald-800">Applied and saved to MongoDB</div>
                        <div className="mt-0.5 text-xs text-emerald-700">
                          {lastApplied.feature_label}: {String(lastApplied.from_value)} →{" "}
                          {String(lastApplied.to_value)}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-700">
                          {(lastApplied.prob_before * 100).toFixed(1)}% →{" "}
                          <span className={lastApplied.delta < 0 ? "text-emerald-700" : "text-rose-700"}>
                            {(lastApplied.prob_after * 100).toFixed(1)}%
                          </span>
                          {lastApplied.delta != null && (
                            <span className={cx("ml-2", lastApplied.delta < 0 ? "text-emerald-600" : "text-rose-600")}>
                              ({lastApplied.delta < 0 ? "↓" : "↑"} {Math.abs(lastApplied.delta * 100).toFixed(1)} pts)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {applyError && (
                  <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    <div className="text-sm text-rose-700">{applyError}</div>
                  </div>
                )}

                {/* Primary reason */}
                {analysis.primary_reason && analysis.primary_reason !== "N/A" && (
                  <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-bold text-slate-900">Primary Driver</div>
                        <div className="mt-1 text-xs text-slate-500">
                          Stage-2 model's most likely reason for leaving.
                        </div>
                      </div>
                      <span
                        className={cx(
                          "shrink-0 rounded-full border px-3 py-1 text-sm font-semibold",
                          getPrimaryReasonColor(analysis.primary_reason)
                        )}
                      >
                        {analysis.primary_reason}
                      </span>
                    </div>
                    <div className="mt-4 space-y-2">
                      {Object.entries(analysis.reason_probs || {})
                        .sort((a, b) => b[1] - a[1])
                        .map(([reason, probability]) => (
                          <div key={reason} className="flex items-center gap-3">
                            <span className="w-28 shrink-0 text-xs text-slate-600">{reason}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-slate-400 transition-all duration-500"
                                style={{ width: `${Math.min(probability * 100, 100)}%` }}
                              />
                            </div>
                            <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-600">
                              {(probability * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
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
                      <span className="font-medium text-slate-600"> Apply writes the change to MongoDB and re-runs the model.</span>
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
                              {plan.changes.map((chg, ci) => {
                                const isApplying = applying === chg.feature_changed;
                                const alreadyApplied = chg.applied;
                                return (
                                  <div key={ci} className="rounded-xl bg-white border border-slate-200 px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm text-slate-800 font-medium">{chg.intervention_label}</div>
                                        <div className="text-xs text-slate-500 mt-0.5">
                                          {chg.feature_label}: {chg.current_value} → {chg.suggested_value}
                                        </div>
                                      </div>

                                      {alreadyApplied ? (
                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          Applied
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleApplyIntervention(chg, plan)}
                                          disabled={applying !== null}
                                          title="Write this change to MongoDB and re-run the attrition model"
                                          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {isApplying ? (
                                            <>
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                              Applying
                                            </>
                                          ) : (
                                            <>
                                              <Zap className="h-3.5 w-3.5" />
                                              Apply live
                                            </>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Dropdown icon={Filter} value={dept} options={departments} onChange={setDept} minWidth={200} />
                  <Dropdown icon={Users} value={mode} options={workModes} onChange={setMode} minWidth={150} />
                  <Dropdown icon={AlertTriangle} value={riskFilter} options={riskTiers} onChange={setRiskFilter} minWidth={150} />
                  {(dept !== "All Department" || mode !== "All Mode" || riskFilter !== "All Risk") && (
                    <button
                      onClick={() => {
                        setDept("All Department");
                        setMode("All Mode");
                        setRiskFilter("All Risk");
                      }}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
                <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                  {filtered.length} of {employees.length} employees
                </Pill>
              </div>
            </div>

            <div className="mt-6">
              {filtered.length === 0 ? (
                <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center">
                  <Users className="mx-auto h-10 w-10 text-slate-300" />
                  <div className="mt-3 text-sm font-semibold text-slate-700">No employees match these filters</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {employees.length === 0
                      ? "Run `npm run db:seed` to load the dataset into MongoDB."
                      : "Try clearing the search or filters."}
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.map((e) => (
                    <EmployeeCard key={e.id} e={e} />
                  ))}
                </div>
              )}
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

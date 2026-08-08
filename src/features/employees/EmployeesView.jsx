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
import Pill from "../../components/ui/Pill.jsx";
import SoftTag from "../../components/ui/SoftTag.jsx";
import Panel, { EmptyState } from "../../components/ui/Panel.jsx";
import { PageIntro } from "../../components/Section.jsx";
import { DeltaHero, Meter } from "../../components/Delta.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";

// ── API base URL (set VITE_API_URL in .env.local) ─────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────
function getRiskColors(tier) {
  if (tier === "Critical")
    return { header: "bg-risk", soft: "bg-risk/12 border-risk/35 text-risk", bar: "bg-risk" };
  if (tier === "High")
    return { header: "bg-risk", soft: "bg-risk/12 border-risk/35 text-risk", bar: "bg-risk" };
  if (tier === "Medium")
    return { header: "bg-raw", soft: "bg-raw/12 border-raw/35 text-raw", bar: "bg-raw" };
  return { header: "bg-ok", soft: "bg-ok/12 border-ok/35 text-ok", bar: "bg-ok" };
}

function getPrimaryReasonColor(reason) {
  const map = {
    Burnout: "bg-risk/12 text-risk border-risk/35",
    Compensation: "bg-raw/12 text-raw border-raw/35",
    Stagnation: "bg-brand/12 text-brand-hi border-brand/35",
    "Career Growth": "bg-ink-750 text-mist-200 border-ink-500",
  };
  return map[reason] || "bg-ink-750 text-mist-400 border-ink-600";
}

function deptPill(d) {
  const map = {
    "Research & Development": "text-mist-200 bg-ink-750 border-ink-500",
    Sales:                    "text-ok bg-ok/12 border-ok/35",
    Engineering:              "text-brand-hi bg-brand/12 border-brand/35",
    HR:                       "text-brand-hi bg-brand/12 border-brand/35",
    Marketing:                "text-mist-200 bg-ink-750 border-ink-500",
  };
  return map[d] || "text-mist-200 bg-ink-850 border-ink-600";
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
          "inline-flex w-full items-center justify-between gap-2 rounded-tile border px-3 py-2 text-sm transition",
          open ? "border-brand/35 bg-brand/12" : "border-ink-600 bg-ink-800 hover:bg-ink-750"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          <Icon className="h-4 w-4 shrink-0 text-mist-500" />
          <span className="truncate">{value}</span>
        </span>
        <ChevronDown className={cx("h-4 w-4 shrink-0 text-mist-500 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full min-w-full overflow-y-auto rounded-tile border border-ink-600 bg-ink-800 py-1">
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
              className={cx(
                "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition",
                option === value ? "bg-brand/12 font-semibold text-brand-hi" : "text-mist-200 hover:bg-ink-750"
              )}
            >
              <span className="truncate">{option}</span>
              {option === value && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
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
  const [applyNotice, setApplyNotice] = useState(null); // "nothing to do", not a failure
  const [lastApplied, setLastApplied] = useState(null);

  /**
   * Reloading the parent's `employees` array mid-view throws you out of the
   * panel: the grid re-filters, and an employee whose tier just dropped from
   * Critical to Low no longer matches an active risk filter, so the detail view
   * deselects itself. Applying a change is exactly when the tier moves, which
   * made it happen every single time.
   *
   * So the parent reload is deferred to the Back button. While you stay and
   * read the result, the panel keeps itself honest with `appliedValues` — the
   * feature values just written, laid over the (now slightly stale) employee
   * record so the profile rows and the plan buttons still read correctly.
   */
  const [appliedValues, setAppliedValues] = useState({});
  const refreshPending = useRef(false);
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

  /**
   * Close the detail panel only when the employee genuinely leaves the dataset
   * (offboarded, or a reload no longer returns them) — not when they stop
   * matching a filter. This used to key off the FILTERED list, so applying an
   * intervention that moved someone from Critical to Low, with a risk filter
   * set, deselected them the instant the list reloaded.
   */
  useEffect(() => {
    if (selectedId && employees.length && !employees.find((x) => x.id === selectedId)) {
      setSelectedId(null);
      setAnalysis(null);
    }
  }, [employees, selectedId]);

  const selectedEmployeeRow = employees.find((x) => x.id === selectedId) || null;
  /** The employee as it now stands, including changes not yet reloaded. */
  const selectedEmployee = selectedEmployeeRow
    ? { ...selectedEmployeeRow, ...appliedValues }
    : null;

  /** Runs the deferred parent reload, once, when leaving the detail panel. */
  function flushPendingRefresh() {
    if (!refreshPending.current) return;
    refreshPending.current = false;
    setAppliedValues({});
    onEmployeesChanged?.();
  }

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
  async function handleSelectEmployee(e, { live = false, keepApplied = false } = {}) {
    setSelectedId(e.id);
    setAnalysis(null);
    setError(null);
    setApplyError(null);
    setApplyNotice(null);
    setLoading(true);
    // "Re-run model" stays on the same person, so the values written a moment
    // ago must survive it. Opening someone else starts clean.
    if (!keepApplied) {
      setLastApplied(null);
      setAppliedValues({});
    }

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
  /**
   * Runs an apply call and then re-reads everything it touched.
   *
   * Writing the change is only half the job: the panel also has to SHOW it.
   * The apply response already carries the analysis straight out of MongoDB,
   * but the employee record behind the left-hand profile (job satisfaction,
   * distance from home, income) lives in the parent's `employees` array, and
   * the DiCE plans decide what is still offerable from it. Reloading both here
   * is what makes the effect visible immediately instead of after a refresh.
   */
  async function runApply(employeeNumber, call, busyKey) {
    setApplying(busyKey);
    setApplyError(null);
    setApplyNotice(null);
    try {
      const result = await call();
      setAnalysis(result);
      // `_noop` means the value was already in place, so there was nothing to
      // write. Say that plainly instead of raising an error.
      setApplyNotice(result._noop?.message || null);
      setLastApplied(result._applied || null);

      // Carry the written values locally so this panel reads correctly while
      // you stay on it. The employee grid behind it reloads on Back, which is
      // what stops the view closing under you mid-read.
      const written = result._applied?.changes || [];
      if (written.length) {
        setAppliedValues((current) => ({
          ...current,
          ...Object.fromEntries(written.map((c) => [c.feature, c.to_value])),
        }));
        refreshPending.current = true;
      }

      // The change history belongs to this panel, so it refreshes right away.
      await api.employees
        .events(employeeNumber)
        .then((data) => setHistory(data.events || []))
        .catch(() => {});
      return result;
    } catch (err) {
      setApplyError(err.message || "Could not apply this change.");
      return null;
    } finally {
      setApplying(null);
    }
  }

  /** One action out of a plan. */
  async function handleApplyIntervention(change, plan) {
    if (!selectedEmployee) return;
    await runApply(
      selectedEmployee.EmployeeNumber,
      () =>
        api.attrition.apply(selectedEmployee.EmployeeNumber, {
          feature: change.feature_changed,
          value: coerceSuggested(change),
          cfIndex: plan?.cf_index ?? null,
          interventionLabel: change.intervention_label,
        }),
      change.feature_changed
    );
  }

  /**
   * Every action in a plan, together.
   *
   * This is not a loop over the single-apply call. The server writes all the
   * changes and re-runs the model once, which is the only way the result
   * matches the "predicted risk after" the plan advertises.
   */
  async function handleApplyPlan(plan) {
    if (!selectedEmployee || !plan?.changes?.length) return;
    await runApply(
      selectedEmployee.EmployeeNumber,
      () =>
        api.attrition.applyPlan(selectedEmployee.EmployeeNumber, {
          changes: plan.changes.map((c) => ({
            feature: c.feature_changed,
            value: coerceSuggested(c),
          })),
          cfIndex: plan.cf_index ?? null,
          planLabel: plan.changes.map((c) => c.intervention_label).filter(Boolean).join(" · "),
        }),
      `plan:${plan.cf_index}`
    );
  }

  async function handleRevert() {
    if (!selectedEmployee) return;
    setReverting(true);
    setApplyError(null);
    setApplyNotice(null);
    try {
      const result = await api.attrition.revert(selectedEmployee.EmployeeNumber);
      setAnalysis(result);
      setLastApplied(result._applied || null);

      const written = result._applied?.changes || [];
      if (written.length) {
        setAppliedValues((current) => ({
          ...current,
          ...Object.fromEntries(written.map((c) => [c.feature, c.to_value])),
        }));
        refreshPending.current = true;
      }

      await api.employees
        .events(selectedEmployee.EmployeeNumber)
        .then((data) => setHistory(data.events || []))
        .catch(() => {});
    } catch (err) {
      setApplyError(err.message || "Could not revert.");
    } finally {
      setReverting(false);
    }
  }

  // ── Sub-components ────────────────────────────────────────────────────────
  const InfoRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[11px] text-mist-500">{label}</div>
      <div className="num text-[13px] font-medium text-paper text-right">{value}</div>
    </div>
  );

  /**
   * One employee in the grid.
   *
   * The risk reading is the point of the card, so it gets the largest type
   * and a meter underneath — a number alone gives no sense of where 62% sits
   * against everyone else. The tier is named as well as coloured.
   */
  const EmployeeCard = ({ e, index }) => {
    const tier = e.risk_tier;
    const pct = e.attrition_pct;
    const toneBar =
      tier === "Critical" || tier === "High" ? "bg-risk" : tier === "Medium" ? "bg-raw" : "bg-ok";
    const toneText =
      tier === "Critical" || tier === "High" ? "text-risk" : tier === "Medium" ? "text-raw" : "text-ok";

    return (
      <button
        type="button"
        onClick={() => handleSelectEmployee(e)}
        className="panel panel-hit enter p-4 text-left"
        style={{ "--i": Math.min(index, 12) }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-ink-500 bg-ink-700 text-[11px] font-bold text-mist-200"
          >
            {e.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold text-paper">{e.name}</span>
            <span className="block truncate text-[11px] text-mist-600">{e.JobRole}</span>
          </span>
          <span className="shrink-0 text-right">
            {tier ? (
              <>
                <span className={cx("num block text-lg font-semibold leading-none", toneText)}>
                  {pct != null ? `${Math.round(pct)}%` : "—"}
                </span>
                <span className="mt-1 block text-[10px] uppercase tracking-wider text-mist-600">{tier}</span>
              </>
            ) : (
              <span className="text-[10px] text-mist-600">Not scored</span>
            )}
          </span>
        </div>

        {tier ? (
          <span className="mt-3 block h-1 overflow-hidden rounded-full bg-ink-700">
            <span
              className={cx("block h-full rounded-full sweep", toneBar)}
              style={{ width: `${Math.min(pct ?? 0, 100)}%`, "--i": Math.min(index, 12) }}
            />
          </span>
        ) : (
          <span className="mt-3 block h-1 rounded-full bg-ink-700" />
        )}

        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist-600">
          <span className="truncate">{e.Department}</span>
          <span aria-hidden="true" className="text-mist-700">
            ·
          </span>
          <span>{e.workMode}</span>
          <span aria-hidden="true" className="text-mist-700">
            ·
          </span>
          <span className="num">{e.joined}</span>
        </span>
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
      "bg-brand/12 text-brand-hi border-brand/35",
      "bg-sky-50 text-sky-700 border-sky-200",
      "bg-brand/12 text-brand-hi border-brand/35",
    ];

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={() => {
              // Leaving is the moment the grid behind this panel catches up.
              flushPendingRefresh();
              setSelectedId(null);
              setAnalysis(null);
              setError(null);
              setLastApplied(null);
              setApplyError(null);
              setApplyNotice(null);
            }}
            className="inline-flex items-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-mist-200 hover:bg-ink-750"
          >
            <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" /> Back
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {analysis?._cached && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-xs font-medium text-mist-500">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                Cached {relativeTime(analysis._computed_at)}
              </span>
            )}
            {history.some((h) => h.action === "intervention_applied") && (
              <button
                onClick={handleRevert}
                disabled={reverting}
                className="inline-flex items-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-xs font-semibold text-mist-200 hover:bg-ink-750 disabled:opacity-50"
              >
                {reverting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                Undo last change
              </button>
            )}
            <button
              onClick={() => handleSelectEmployee(emp, { live: true, keepApplied: true })}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-tile border border-brand/35 bg-brand/12 px-3 py-2 text-xs font-semibold text-brand-hi hover:bg-brand/12 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
              Re-run model
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          {/* LEFT: profile */}
          <div className="panel p-5">
            <div className="flex items-start gap-4">
              <div className="h-20 w-20 rounded-panel border border-ink-600 flex items-center justify-center text-2xl font-bold text-brand-hi">
                {emp.initials}
              </div>
              <div className="flex-1">
                <div className="text-2xl font-bold text-paper">{emp.name}</div>
                <div className="text-sm text-mist-500 mt-1">{emp.JobRole}</div>
                <div className="text-xs text-mist-600 mt-1">{emp.email}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className={cx("inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm", deptPill(emp.Department))}>
                    <span className="h-2 w-2 rounded-full bg-current opacity-60" />
                    {emp.Department}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-3 py-1 text-sm text-mist-200">
                    <Calendar className="h-4 w-4" aria-hidden="true" /> {emp.joined}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-3 py-1 text-sm text-mist-200">
                    {emp.workMode}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-tile border border-ink-600 bg-ink-850 p-4 space-y-2.5">
              <div className="eyebrow">Employee Info</div>
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

            <div className="mt-4 rounded-tile border border-ink-600 bg-ink-850 p-4">
              <div className="eyebrow">Skills</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(emp.skills || []).map((s) => (
                  <SoftTag key={s}>{s}</SoftTag>
                ))}
              </div>
            </div>

            {/* Live-change history, straight from attrition_events */}
            {history.length > 0 && (
              <div className="mt-4 rounded-tile border border-ink-600 bg-ink-850 p-4">
                <div className="eyebrow flex items-center gap-2">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  Change history
                </div>
                <div className="mt-3 space-y-2">
                  {history.slice(0, 6).map((event) => {
                    const improved = event.delta != null && event.delta < 0;
                    return (
                      <div key={event._id} className="rounded-tile border border-ink-600 bg-ink-850 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          {/* A plan applied in one step moved several features,
                              so list them all rather than only the first. */}
                          <div className="text-xs font-semibold text-paper">
                            {event.changes?.length > 1 ? (
                              <>
                                <div className="text-mist-500">{event.changes.length} changes together</div>
                                {event.changes.map((c, i) => (
                                  <div key={i}>
                                    {c.feature_label}: {String(c.from_value)} → {String(c.to_value)}
                                  </div>
                                ))}
                              </>
                            ) : (
                              <>
                                {event.feature_label}: {String(event.from_value)} → {String(event.to_value)}
                              </>
                            )}
                          </div>
                          {event.delta != null && (
                            <div
                              className={cx(
                                "shrink-0 text-xs font-bold",
                                improved ? "text-ok" : "text-risk"
                              )}
                            >
                              {improved ? "↓" : "↑"} {Math.abs(event.delta * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-mist-500">
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
              <div className="panel flex flex-col items-center justify-center gap-3 p-10">
                <Loader2 className="h-8 w-8 text-brand-hi animate-spin" aria-hidden="true" />
                <div className="text-sm text-mist-400 font-medium">Running AI inference…</div>
                <div className="text-xs text-mist-600">XGBoost → SHAP → DiCE</div>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="panel border-risk/35 bg-risk/8 p-5">
                <div className="text-sm font-semibold text-risk mb-1">Inference failed</div>
                <div className="text-xs text-risk">{error}</div>
                <div className="mt-3 text-xs text-risk">
                  Make sure the backend is running at: <code className="bg-risk/12 px-1 rounded">{API_URL}</code>
                </div>
              </div>
            )}

            {/* Results */}
            {analysis && !loading && !error && (
              <>
                {/* ── The reading. Everything else on this screen explains it. ── */}
                <div className="feature p-6">
                  <div className="relative flex items-start justify-between gap-4">
                    <DeltaHero
                      onFeature
                      label="Attrition risk"
                      value={pct}
                      previous={
                        analysis._baseline_probability != null &&
                        Math.abs(analysis._baseline_probability - analysis.attrition_prob) > 0.001
                          ? analysis._baseline_probability * 100
                          : null
                      }
                      tone={
                        analysis.risk_tier === "Critical" || analysis.risk_tier === "High"
                          ? "risk"
                          : analysis.risk_tier === "Medium"
                            ? "raw"
                            : "ok"
                      }
                      note={`${analysis.risk_tier} · company baseline ~16%`}
                    />
                    {analysis._interventions_applied > 0 && (
                      <Pill tone="ok" className="shrink-0">
                        {analysis._interventions_applied} applied
                      </Pill>
                    )}
                  </div>

                  {/* The employee against the 16% company baseline. */}
                  <div className="relative mt-6">
                    <div className="relative h-1.5 overflow-hidden rounded-full bg-white/12">
                      <div
                        className={cx("h-full rounded-full sweep", (analysis.risk_tier === "Critical" || analysis.risk_tier === "High" ? "bg-[#ff7a8f]" : analysis.risk_tier === "Medium" ? "bg-[#f0b429]" : "bg-[#34d399]"))}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                      <span
                        aria-hidden="true"
                        className="absolute top-0 h-full w-px bg-white/55"
                        style={{ left: "16%" }}
                      />
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] feature-faint">
                      <span>0%</span>
                      <span>baseline 16%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>

                {/* Live intervention outcome banner */}
                {lastApplied && (
                  <div className="panel border-ok/35 bg-ok/8 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-tile bg-ok/12 text-ok">
                        <Zap className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ok">
                          {lastApplied.changes?.length > 1 ? `${lastApplied.changes.length} changes applied` : "Applied"}
                        </div>
                        <div className="num mt-1 space-y-0.5 text-[11px] text-ok/85">
                          {(lastApplied.changes?.length
                            ? lastApplied.changes
                            : [lastApplied]
                          ).map((c, i) => (
                            <div key={i}>
                              {c.feature_label}: {String(c.from_value)} → {String(c.to_value)}
                            </div>
                          ))}
                        </div>
                        <div className="num mt-1.5 text-xs font-semibold text-mist-200">
                          {(lastApplied.prob_before * 100).toFixed(1)}% →{" "}
                          <span className={lastApplied.delta < 0 ? "text-ok" : "text-risk"}>
                            {(lastApplied.prob_after * 100).toFixed(1)}%
                          </span>
                          {lastApplied.delta != null && (
                            <span className={cx("ml-2", lastApplied.delta < 0 ? "text-ok" : "text-risk")}>
                              ({lastApplied.delta < 0 ? "↓" : "↑"} {Math.abs(lastApplied.delta * 100).toFixed(1)} pts)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {applyNotice && (
                  <div className="panel flex items-start gap-2 border-raw/35 bg-raw/8 p-3.5">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-raw" aria-hidden="true" />
                    <div className="text-sm text-raw">
                      <span className="font-semibold">Nothing to change. </span>
                      {applyNotice}
                    </div>
                  </div>
                )}

                {applyError && (
                  <div className="panel flex items-start gap-2 border-risk/35 bg-risk/8 p-3.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
                    <div className="text-sm text-risk">{applyError}</div>
                  </div>
                )}

                {/* Primary reason */}
                {analysis.primary_reason && analysis.primary_reason !== "N/A" && (
                  <div className="panel p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-paper">Primary Driver</div>
                        <div className="mt-1 text-xs text-mist-500">
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
                            <span className="w-28 shrink-0 text-xs text-mist-400">{reason}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-750">
                              <div
                                className="h-full rounded-full bg-mist-500 transition-[width,transform] duration-500"
                                style={{ width: `${Math.min(probability * 100, 100)}%` }}
                              />
                            </div>
                            <span className="w-12 shrink-0 text-right font-mono text-xs text-mist-400">
                              {(probability * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* SHAP Top-5 */}
                <div className="panel p-5">
                  <div className="text-sm font-semibold text-paper">Key Risk Drivers</div>
                  <div className="text-xs text-mist-500 mt-1 mb-4">
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
                          "rounded-tile border px-4 py-3",
                          isRisk ? "border-risk/35 bg-risk/12" : "border-ok/35 bg-ok/12"
                        )}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <div className="text-sm font-semibold text-paper">{item.feature_label}</div>
                              <div className="text-xs text-mist-500 mt-0.5">Current value: {item.raw_value}</div>
                            </div>
                            <div className={cx(
                              "inline-flex items-center gap-1 text-sm font-mono font-bold",
                              isRisk ? "text-risk" : "text-ok"
                            )}>
                              {isRisk
                                ? <TrendingUp className="h-4 w-4" aria-hidden="true" />
                                : <TrendingDown className="h-4 w-4" aria-hidden="true" />
                              }
                              {isRisk ? "+" : ""}{item.shap_value.toFixed(3)}
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-ink-800/60 overflow-hidden">
                            <div
                              className={cx("h-full rounded-full transition-[width,transform] duration-500",
                                isRisk ? "bg-risk" : "bg-ok"
                              )}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          <div className="mt-1 text-xs text-mist-500">
                            {isRisk ? "⬆ Increases attrition risk" : "⬇ Reduces attrition risk"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* DiCE Intervention Plans */}
                {plans.length > 0 && (
                  <div className="panel p-5">
                    <div className="text-sm font-semibold text-paper">Intervention Plans</div>
                    <div className="text-xs text-mist-500 mt-1 mb-4">
                      Counterfactual scenarios. Each predicted risk is scored by the model on that exact change,
                      so applying a plan lands on the figure shown.
                    </div>
                    <div className="space-y-3">
                      {plans.map((plan, idx) => {
                        const planName = planNames[idx] || `Plan ${plan.cf_index}`;
                        const tagColor = planTagColors[idx] || planTagColors[0];
                        // A plan is fully done when nothing in it is still
                        // offerable — either already applied, or the employee
                        // already sits at the suggested value.
                        const outstanding = plan.changes.filter((chg) => {
                          const live = emp[chg.feature_changed];
                          const atTarget =
                            live !== undefined && live !== null && String(live) === String(chg.suggested_value);
                          return !chg.applied && !atTarget;
                        });
                        const planBusy = applying === `plan:${plan.cf_index}`;
                        return (
                          <div key={plan.cf_index} className="rounded-tile border border-ink-600 bg-ink-850 p-4">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex items-center gap-2">
                                <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", tagColor)}>
                                  {planName}
                                </span>
                                <span className="text-xs text-mist-500">
                                  {plan.changes.length} action{plan.changes.length > 1 ? "s" : ""}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-xs text-mist-500">Predicted risk after</div>
                                <div className="text-sm font-bold text-paper">
                                  {(plan.new_prob * 100).toFixed(1)}%
                                </div>
                                <div className="text-xs text-ok font-semibold">
                                  ↓ -{(plan.risk_reduction * 100).toFixed(1)}%
                                </div>
                              </div>
                            </div>

                            {/* Apply the plan as one step. The predicted risk
                                above is the probability once EVERY action is in
                                place, so this is the button that actually
                                delivers it — the per-action buttons below move
                                one feature at a time. */}
                            {outstanding.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleApplyPlan({ ...plan, changes: outstanding })}
                                disabled={applying !== null}
                                title={`Write all ${outstanding.length} changes to MongoDB and re-run the model once`}
                                className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-tile bg-brand px-3 py-2 text-[11px] font-bold text-paper transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {planBusy ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                    Applying {planName}…
                                  </>
                                ) : (
                                  <>
                                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                                    Apply all of {planName}
                                    {outstanding.length < plan.changes.length
                                      ? ` (${outstanding.length} left)`
                                      : ` (${outstanding.length} action${outstanding.length > 1 ? "s" : ""})`}
                                  </>
                                )}
                              </button>
                            ) : (
                              <div className="mb-3 inline-flex w-full items-center justify-center gap-1.5 rounded-tile border border-ok/35 bg-ok/12 px-3 py-2 text-[11px] font-bold text-ok">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                {planName} is fully applied
                              </div>
                            )}
                            <div className="space-y-2">
                              {plan.changes.map((chg, ci) => {
                                const isApplying = applying === chg.feature_changed;
                                // Two ways a counterfactual can be a no-op: the
                                // server marked it applied, or the employee
                                // record already holds the suggested value (a
                                // cached plan set that predates a change).
                                // Either way, offering "Apply live" would only
                                // produce an error, so we don't.
                                const liveValue = emp[chg.feature_changed];
                                const alreadyAtTarget =
                                  liveValue !== undefined &&
                                  liveValue !== null &&
                                  String(liveValue) === String(chg.suggested_value);
                                const alreadyApplied = chg.applied || alreadyAtTarget;
                                return (
                                  <div key={ci} className="rounded-tile bg-ink-800 border border-ink-600 px-3 py-2">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="text-sm text-paper font-medium">{chg.intervention_label}</div>
                                        <div className="text-xs text-mist-500 mt-0.5">
                                          {chg.feature_label}: {chg.current_value} → {chg.suggested_value}
                                        </div>
                                      </div>

                                      {alreadyApplied ? (
                                        <span
                                          title={
                                            chg.applied
                                              ? "This counterfactual was written to MongoDB."
                                              : `${chg.feature_label} is already ${chg.suggested_value} on this employee.`
                                          }
                                          className="inline-flex shrink-0 items-center gap-1 rounded-tile border border-ok/35 bg-ok/12 px-2.5 py-1.5 text-[11px] font-bold text-ok"
                                        >
                                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                          {chg.applied ? "Applied" : "Already in effect"}
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => handleApplyIntervention(chg, plan)}
                                          disabled={applying !== null}
                                          title="Write this change to MongoDB and re-run the attrition model"
                                          className="inline-flex shrink-0 items-center gap-1.5 rounded-tile bg-ink-850 px-3 py-1.5 text-[11px] font-bold text-paper transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {isApplying ? (
                                            <>
                                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Applying…</>
                                          ) : (
                                            <>
                                              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
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
                  <div className="panel border-ok/35 bg-ok/8 p-5">
                    <div className="text-base font-bold text-ok">Low attrition risk</div>
                    <div className="text-sm text-ok mt-1">
                      Below the high-risk threshold. No counterfactual plans were generated.
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
  const filtersActive = dept !== "All Department" || mode !== "All Mode" || riskFilter !== "All Risk";

  return !selectedEmployee ? (
    <div className="space-y-7">
      <PageIntro
        kicker="Retention"
        title="Who is most likely to leave"
        lede="Every person scored by the model, with the counterfactual plans that would move the number. Open anyone to see what changes it and by how much."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Dropdown icon={Filter} value={dept} options={departments} onChange={setDept} minWidth={190} />
        <Dropdown icon={Users} value={mode} options={workModes} onChange={setMode} minWidth={140} />
        <Dropdown icon={AlertTriangle} value={riskFilter} options={riskTiers} onChange={setRiskFilter} minWidth={140} />
        {filtersActive && (
          <button
            type="button"
            onClick={() => {
              setDept("All Department");
              setMode("All Mode");
              setRiskFilter("All Risk");
            }}
            className="h-9 rounded-tile px-3 text-xs font-medium text-mist-500 transition-colors hover:bg-ink-800 hover:text-paper"
          >
            Clear filters
          </button>
        )}
        <span className="num ml-auto text-[11px] text-mist-600" aria-live="polite">
          {filtered.length} of {employees.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees match these filters"
          body={
            employees.length === 0
              ? "Nothing is loaded. Run npm run db:seed to import the dataset into MongoDB."
              : "Try clearing the search or the filters above."
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((e, i) => (
            <EmployeeCard key={e.id} e={e} index={i} />
          ))}
        </div>
      )}
    </div>
  ) : (
    renderDetailPanel()
  );
}

export default EmployeesView;

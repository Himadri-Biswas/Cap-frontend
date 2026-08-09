import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, BarChart3, Brain, Briefcase, Check, ChevronDown,
  Code2, Cpu, Database, FlaskConical, History, Layers, Loader2,
  Search, Server, Sparkles, Target, TrendingUp, Users,
} from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import { cx } from "../../lib/cx.js";
import { skillTone } from "../../lib/skillTone.js";
import { api } from "../../lib/api.js";

// ── Module 2 API base URL (set VITE_MODULE2_API_URL in .env.local) ────────
const MODULE2_API_URL = import.meta.env.VITE_MODULE2_API_URL || "https://rafatkabir-talent-matching-api.hf.space";

function buildResumeText(employee) {
  if (!employee) return "";
  const lines = [];
  lines.push(`${employee.name || ""} - ${employee.JobRole || ""}`.trim());
  if (employee.Department) lines.push(`Department: ${employee.Department}`);
  if (employee.TotalWorkingYears) lines.push(`${employee.TotalWorkingYears} years of total working experience.`);
  if (employee.YearsInCurrentRole) lines.push(`${employee.YearsInCurrentRole} years in current role.`);
  const skills = (employee.skills || []).join(", ");
  if (skills) lines.push(`Skills: ${skills}.`);
  return lines.join("\n");
}

function buildJdText(job) {
  if (!job) return "";
  const lines = [];
  lines.push(`${job.title || ""} - ${job.dept || ""}`.trim());
  if (job.summary) lines.push(job.summary);
  const skills = (job.skills || []).join(", ");
  if (skills) lines.push(`Required skills: ${skills}.`);
  return lines.join("\n");
}

// Ordered: most-specific rule first so "Data Platform" hits Server before BarChart3
const DEPT_ICON_RULES = [
  [/infra|devops|platform|ops/i,      Server],
  [/ai|ml|machine/i,                  Brain],
  [/cse|software|engineer/i,          Cpu],
  [/data|analytic/i,                  BarChart3],
  [/it\b|tech/i,                      Code2],
  [/hr|people|human/i,                Users],
  [/product/i,                        Layers],
  [/research|science/i,               FlaskConical],
  [/finance|account/i,                TrendingUp],
  [/sales|market/i,                   Target],
];
function getDeptIcon(dept = "") {
  const Rule = DEPT_ICON_RULES.find(([re]) => re.test(dept));
  const Icon = Rule ? Rule[1] : Briefcase;
  return <Icon className="h-4 w-4 shrink-0 text-mist-500" aria-hidden="true" />;
}

const AVATAR_PALETTE = ["#5B6BF5","#0EA66B","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#F97316","#EC4899","#14B8A6","#64748B"];
function avatarBg(name = "") {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

const CRITICALITY_TONE = {
  required: "border-risk/35 bg-risk/12 text-risk",
  strong: "border-ink-500 bg-ink-750 text-mist-200",
  preferred: "border-raw/35 bg-raw/12 text-raw",
  nice_to_have: "border-brand/35 bg-brand/12 text-brand-hi",
  optional: "border-ink-600 bg-ink-850 text-mist-400",
  inferred: "border-ink-600 bg-ink-850 text-mist-400",
};

function UpskillingView({ jobs, employees, search, setSearch }) {
  const [targetJobId, setTargetJobId] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [maxTime, setMaxTime] = useState(120);
  const [maxBudget, setMaxBudget] = useState(300);
  const [jobMode, setJobMode] = useState("select");
  const [customJobDescription, setCustomJobDescription] = useState("");
  const [customJobChecked, setCustomJobChecked] = useState(false);
  const [levelHint, setLevelHint] = useState("Mid-Level");
  const [jobSearch, setJobSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [empSearch, setEmpSearch] = useState("");
  const [empDeptFilter, setEmpDeptFilter] = useState("all");
  const [empPage, setEmpPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [pastPaths, setPastPaths] = useState([]);

  const upskillingTargetJobs = useMemo(() => {
    const extraTargets = [
      {
        id: "U301",
        title: "Data Engineer",
        dept: "Data Platform",
        location: "Hybrid",
        skills: ["Python", "SQL", "Data Modeling", "ETL", "Airflow", "Cloud"],
      },
      {
        id: "U302",
        title: "DevOps Engineer",
        dept: "Infrastructure",
        location: "Remote",
        skills: ["Linux", "CI/CD", "Docker", "Kubernetes", "Monitoring", "AWS"],
      },
      {
        id: "U303",
        title: "Product Manager",
        dept: "Product",
        location: "Hybrid",
        skills: ["Product Strategy", "User Stories", "Roadmapping", "Analytics", "Communication"],
      },
    ];

    return [...jobs, ...extraTargets];
  }, [jobs]);

  const selectedTargetJob = targetJobId ? upskillingTargetJobs.find((j) => j.id === targetJobId) : null;
  const selectedEmployee = employeeId ? employees.find((e) => e.id === employeeId) : null;

  const resetResult = () => {
    setResult(null);
    setError(null);
    setSaved(false);
  };

  // Previously generated paths for this employee, straight from `learning_paths`.
  useEffect(() => {
    if (!selectedEmployee?.EmployeeNumber) {
      setPastPaths([]);
      return;
    }
    let cancelled = false;
    api.upskilling
      .paths({ EmployeeNumber: selectedEmployee.EmployeeNumber, limit: 5 })
      .then((data) => !cancelled && setPastPaths(data.paths || []))
      .catch(() => !cancelled && setPastPaths([]));
    return () => {
      cancelled = true;
    };
  }, [selectedEmployee?.EmployeeNumber, saved]);

  const activeJobTitle = jobMode === "select" ? selectedTargetJob?.title : "Custom Job";
  const canGenerate = Boolean(
    selectedEmployee && (jobMode === "select" ? selectedTargetJob : customJobChecked && customJobDescription.trim())
  );

  async function handleGenerateLearningPath() {
    if (!canGenerate) return;
    const jdText = jobMode === "select" ? buildJdText(selectedTargetJob) : customJobDescription.trim();
    const resumeText = buildResumeText(selectedEmployee);

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);

    // Identical body either way — this is the exact payload Module 2 expects.
    const mlPayload = {
      resume_text: resumeText,
      jd_text: jdText,
      level_hint: levelHint,
      max_hours: maxTime,
      max_budget: maxBudget,
    };

    try {
      // Preferred path: through our API, which forwards this body verbatim to
      // the same `/analyze-text` endpoint and stores the response as it comes
      // back. One ML round-trip, and the result is persisted.
      const data = await api.upskilling.analyze({
        ...mlPayload,
        employeeId: selectedEmployee?.id ?? null,
        EmployeeNumber: selectedEmployee?.EmployeeNumber ?? null,
        employeeName: selectedEmployee?.name ?? null,
        targetJobId: jobMode === "select" ? selectedTargetJob?.id ?? null : null,
        targetJobTitle: activeJobTitle,
        isCustomJob: jobMode !== "select",
      });
      setResult(data);
      setSaved(!!data._persisted);
    } catch (proxyError) {
      // Our server is down but the ML Space may be fine — go direct, exactly as
      // before. The analysis still renders; it just is not saved.
      try {
        const response = await fetch(`${MODULE2_API_URL.replace(/\/$/, "")}/analyze-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mlPayload),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Module 2 API error ${response.status}`);
        }

        const data = await response.json();
        setResult(data);
        setSaved(false);
      } catch (err) {
        setError(err.message || proxyError.message || "Failed to reach the Module 2 learning path API. Is the backend running?");
      }
    } finally {
      setLoading(false);
    }
  }

  const jobList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return upskillingTargetJobs;
    return upskillingTargetJobs.filter((j) => `${j.title} ${j.dept} ${j.location}`.toLowerCase().includes(q));
  }, [upskillingTargetJobs, search]);

  const employeeList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => `${e.name} ${e.JobRole} ${e.email}`.toLowerCase().includes(q));
  }, [employees, search]);

  // Job panel: local search + dept filter + grouped by department
  const allDepts = useMemo(() => {
    const s = new Set(upskillingTargetJobs.map((j) => j.dept).filter(Boolean));
    return Array.from(s).sort();
  }, [upskillingTargetJobs]);

  const filteredJobList = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    return upskillingTargetJobs.filter((j) => {
      const matchQ = !q || `${j.title} ${j.dept}`.toLowerCase().includes(q);
      const matchDept = deptFilter === "all" || j.dept === deptFilter;
      return matchQ && matchDept;
    });
  }, [upskillingTargetJobs, jobSearch, deptFilter]);

  const groupedJobs = useMemo(() => {
    const map = {};
    for (const j of filteredJobList) {
      const key = j.dept || "Other";
      (map[key] = map[key] || []).push(j);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredJobList]);

  // Employee panel: local search + dept filter + pagination
  const empAllDepts = useMemo(() => {
    const s = new Set(employees.map((e) => e.Department).filter(Boolean));
    return Array.from(s).sort();
  }, [employees]);

  const EMP_PAGE_SIZE = 10;

  const filteredEmployeeList = useMemo(() => {
    setEmpPage(1);
    const q = empSearch.trim().toLowerCase();
    return employees.filter((e) => {
      const matchQ = !q || `${e.name} ${e.JobRole} ${e.Department}`.toLowerCase().includes(q);
      const matchDept = empDeptFilter === "all" || e.Department === empDeptFilter;
      return matchQ && matchDept;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, empSearch, empDeptFilter]);

  const empTotalPages = Math.max(1, Math.ceil(filteredEmployeeList.length / EMP_PAGE_SIZE));
  const pagedEmployeeList = filteredEmployeeList.slice(
    (empPage - 1) * EMP_PAGE_SIZE,
    empPage * EMP_PAGE_SIZE
  );

  const gaps = result?.gap_analysis?.gaps || [];
  const learningPath = result?.learning_path?.learning_path || [];
  const resumeSkills = result?.resume_skills || [];

  return (
    <div className="rounded-[28px] overflow-hidden border border-ink-600 bg-ink-800">
      <div className="bg-ink-800 p-6">
        <div className="grid items-start gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="h-[560px] rounded-panel border border-ink-600 bg-ink-800 p-4 flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-paper">Select target job</div>
              {(jobMode === "select" ? selectedTargetJob : customJobDescription) && (
                <button
                  onClick={() => {
                    resetResult();
                    if (jobMode === "select") {
                      setTargetJobId(null);
                    } else {
                      setCustomJobDescription("");
                      setCustomJobChecked(false);
                    }
                  }}
                  className="text-xs text-mist-500 hover:text-mist-200"
                >
                  Clear
                </button>
              )}
            </div>

            {/* A segmented control needs its active state to be UNMISTAKABLE —
                this one used to rely on gradient stops with no direction
                utility attached, so "active" and "inactive" rendered
                identically. Solid fills instead. */}
            <div className="mt-3 inline-flex gap-1 rounded-tile border border-ink-600 bg-ink-850 p-1">
              <button
                type="button"
                onClick={() => {
                  setJobMode("select");
                  setCustomJobChecked(false);
                  resetResult();
                }}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  jobMode === "select" ? "bg-brand text-white" : "text-mist-400 hover:bg-ink-800 hover:text-paper"
                )}
              >
                Select Job
              </button>
              <button
                type="button"
                onClick={() => {
                  setJobMode("custom");
                  setTargetJobId(null);
                  resetResult();
                }}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  jobMode === "custom" ? "bg-fair text-ink-950" : "text-mist-400 hover:bg-ink-800 hover:text-paper"
                )}
              >
                Custom Job
              </button>
            </div>

            {jobMode === "select" ? (
              <>
                {/* Search + dept filter */}
                <div className="mt-3 flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-tile border border-ink-600 bg-ink-850 px-2.5 h-8 focus-within:border-brand/50 transition-colors">
                    <Search className="h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" />
                    <input
                      value={jobSearch}
                      onChange={(e) => setJobSearch(e.target.value)}
                      placeholder={`Search ${deptFilter === "all" ? upskillingTargetJobs.length : filteredJobList.length} job titles…`}
                      aria-label="Search job titles"
                      className="min-w-0 flex-1 bg-transparent text-[12px] text-paper outline-none placeholder:text-mist-600"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={deptFilter}
                      onChange={(e) => setDeptFilter(e.target.value)}
                      className="h-8 appearance-none rounded-tile border border-ink-600 bg-ink-850 pl-2.5 pr-6 text-[12px] text-paper outline-none focus:border-brand/50 transition-colors cursor-pointer"
                    >
                      <option value="all">All depts</option>
                      {allDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mist-500" aria-hidden="true" />
                  </div>
                </div>

                {/* Grouped job list */}
                <div className="mt-2 flex-1 overflow-y-auto pr-1 space-y-3">
                  {groupedJobs.length === 0 && (
                    <div className="py-8 text-center text-xs text-mist-600">No jobs match.</div>
                  )}
                  {groupedJobs.map(([dept, deptJobs]) => (
                    <div key={dept}>
                      <div className="mb-1.5 flex items-center justify-between px-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-mist-600">{dept}</span>
                        <span className="text-[10px] text-mist-600">{deptJobs.length}</span>
                      </div>
                      <div className="space-y-1.5">
                        {deptJobs.map((j) => {
                          const isActive = j.id === targetJobId;
                          return (
                            <button
                              key={j.id}
                              onClick={() => { setTargetJobId(j.id); resetResult(); }}
                              className={cx(
                                "w-full flex items-center gap-3 rounded-tile border px-3 py-2.5 text-left transition duration-150",
                                isActive
                                  ? "border-brand/45 bg-brand/8 ring-1 ring-brand/25"
                                  : "border-ink-600 bg-ink-800 hover:border-ink-400 hover:bg-ink-750"
                              )}
                            >
                              {getDeptIcon(dept)}
                              <span className="flex-1 text-[13px] font-semibold text-paper">{j.title}</span>
                              <div className={cx(
                                "h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
                                isActive ? "border-brand bg-brand" : "border-ink-500"
                              )}>
                                {isActive && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="mt-3 flex-1 flex flex-col gap-3">
                <div className="flex flex-1 flex-col">
                  <textarea
                    value={customJobDescription}
                    onChange={(e) => {
                      setCustomJobDescription(e.target.value);
                      setCustomJobChecked(false);
                      resetResult();
                    }}
                    rows={5}
                    className="w-full flex-1 min-h-[220px] resize-none rounded-tile border border-ink-600 bg-ink-800 p-3 text-sm text-paper outline-none placeholder:text-mist-600 focus:border-brand/35 transition-colors"
                    placeholder="Write job description (responsibilities, required skills, tools, experience)…"
                  />
                  <div className="mt-1.5 flex items-center justify-between px-0.5">
                    <span className={cx("text-[11px] font-medium tabular-nums", customJobDescription.length >= 40 ? "text-ok" : "text-mist-500")}>
                      {customJobDescription.length} characters
                    </span>
                    <span className="text-[11px] text-mist-600">Minimum 40 characters</span>
                  </div>
                </div>
                <Button
                  onClick={() => setCustomJobChecked(true)}
                  className="w-full rounded-tile bg-brand hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={customJobDescription.trim().length < 40}
                >
                  Check Now
                </Button>
              </div>
            )}
          </div>

          <div className="h-[560px] rounded-panel border border-ink-600 bg-ink-800 p-4 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-paper">Select employee</div>
              {selectedEmployee && (
                <button onClick={() => { setEmployeeId(null); resetResult(); }} className="text-xs text-mist-500 hover:text-mist-200">Clear</button>
              )}
            </div>

            {/* Search + dept filter */}
            <div className="mt-3 flex gap-2">
              <div className="flex flex-1 items-center gap-2 rounded-tile border border-ink-600 bg-ink-850 px-2.5 h-8 focus-within:border-brand/50 transition-colors">
                <Search className="h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" />
                <input
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  placeholder={`Search ${empDeptFilter === "all" ? employees.length : filteredEmployeeList.length} employees…`}
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-paper outline-none placeholder:text-mist-600"
                />
              </div>
              <div className="relative">
                <select
                  value={empDeptFilter}
                  onChange={(e) => setEmpDeptFilter(e.target.value)}
                  className="h-8 appearance-none rounded-tile border border-ink-600 bg-ink-850 pl-2.5 pr-6 text-[12px] text-paper outline-none focus:border-brand/50 transition-colors cursor-pointer"
                >
                  <option value="all">All depts</option>
                  {empAllDepts.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-mist-500" aria-hidden="true" />
              </div>
            </div>

            {/* Employee grid */}
            <div className="mt-3 grid flex-1 auto-rows-min content-start gap-2.5 overflow-y-auto pr-1 sm:grid-cols-2">
              {pagedEmployeeList.map((e) => {
                const isActive = e.id === employeeId;
                const initials = e.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <button
                    key={e.id}
                    onClick={() => { setEmployeeId(e.id); resetResult(); }}
                    className={cx(
                      "rounded-tile border p-3 text-left transition duration-150",
                      isActive
                        ? "border-brand/45 bg-brand/8 ring-1 ring-brand/25"
                        : "border-ink-600 bg-ink-800 hover:border-ink-400 hover:bg-ink-750"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                        style={{ backgroundColor: avatarBg(e.name) }}
                      >
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-paper leading-tight">{e.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-mist-500 leading-tight">{e.JobRole}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className="inline-flex truncate max-w-full rounded-full border border-brand/30 bg-brand/10 px-2 py-px text-[10px] font-medium text-brand-hi">{e.JobRole}</span>
                          {e.Department && (
                            <span className="inline-flex truncate max-w-full rounded-full border border-ok/30 bg-ok/10 px-2 py-px text-[10px] font-medium text-ok">{e.Department}</span>
                          )}
                        </div>
                      </div>
                      <div className={cx(
                        "shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        isActive ? "border-brand bg-brand" : "border-ink-500 bg-transparent"
                      )}>
                        {isActive && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                    </div>
                  </button>
                );
              })}
              {pagedEmployeeList.length === 0 && (
                <div className="col-span-2 py-8 text-center text-xs text-mist-600">No employees match your filter.</div>
              )}
            </div>

            {/* Pagination */}
            {empTotalPages > 1 && (
              <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-3">
                <span className="text-[11px] text-mist-500 num">Page {empPage} of {empTotalPages}</span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={empPage === 1}
                    onClick={() => setEmpPage((p) => p - 1)}
                    className="flex h-7 items-center gap-1 rounded-tile border border-ink-600 bg-ink-850 px-2 text-[11px] text-mist-400 transition hover:border-ink-400 hover:text-paper disabled:cursor-not-allowed disabled:opacity-35"
                  >‹ Prev</button>
                  {Array.from({ length: empTotalPages }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === empTotalPages || Math.abs(n - empPage) <= 1)
                    .reduce((acc, n, idx, arr) => {
                      if (idx > 0 && n - arr[idx - 1] > 1) acc.push("…");
                      acc.push(n);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      item === "…" ? (
                        <span key={`e-${idx}`} className="px-1 text-[11px] text-mist-600">…</span>
                      ) : (
                        <button
                          key={item}
                          onClick={() => setEmpPage(item)}
                          className={cx(
                            "h-7 w-7 rounded-tile border text-[11px] num transition",
                            item === empPage
                              ? "border-brand/50 bg-brand/15 text-brand-hi font-semibold"
                              : "border-ink-600 bg-ink-850 text-mist-400 hover:border-ink-400 hover:text-paper"
                          )}
                        >{item}</button>
                      )
                    )}
                  <button
                    disabled={empPage === empTotalPages}
                    onClick={() => setEmpPage((p) => p + 1)}
                    className="flex h-7 items-center gap-1 rounded-tile border border-ink-600 bg-ink-850 px-2 text-[11px] text-mist-400 transition hover:border-ink-400 hover:text-paper disabled:cursor-not-allowed disabled:opacity-35"
                  >Next ›</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {Boolean(selectedEmployee && (jobMode === "select" ? selectedTargetJob : customJobChecked)) && (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-paper">Recommended learning path</div>
                {saved && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-ok/35 bg-ok/12 px-2 py-0.5 text-[10px] font-semibold text-ok">
                    <Database className="h-3 w-3" aria-hidden="true" />
                    Saved to MongoDB
                  </span>
                )}
              </div>
              <Button
                onClick={handleGenerateLearningPath}
                className="rounded-tile bg-brand px-4 hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
                disabled={loading || !canGenerate}
              >
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Analyzing</>
                ) : (
                  <><Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />{result ? "Regenerate" : "Generate Learning Path"}</>
                )}
              </Button>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-tile border border-risk/35 bg-risk/8 p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
                <div>
                  <div className="text-sm font-semibold text-risk">Learning path generation failed</div>
                  <div className="mt-1 text-sm text-risk">{error}</div>
                  <div className="mt-1 text-xs text-risk/80">API: {MODULE2_API_URL}</div>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">

                {/* ── Profile summary card ── */}
                <div className="rounded-panel border border-brand/20 bg-brand/5 p-5">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mist-600 mb-1">target role</div>
                    <div className="text-[15px] font-bold text-brand-hi leading-snug">{activeJobTitle}</div>
                  </div>
                  <div className="my-4 border-t border-brand/15" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mist-600 mb-2">employee</div>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
                        style={{ backgroundColor: avatarBg(selectedEmployee.name) }}
                      >
                        {selectedEmployee.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-paper leading-tight">{selectedEmployee.name}</div>
                        <div className="text-[11px] text-mist-500 leading-tight mt-0.5">{selectedEmployee.JobRole}</div>
                      </div>
                    </div>
                  </div>
                  <div className="my-4 border-t border-brand/15" />
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-mist-600 mb-2">target level</div>
                    <div className="flex flex-col gap-1">
                      {["Junior", "Mid-Level", "Senior"].map((lvl) => (
                        <button
                          key={lvl}
                          onClick={() => setLevelHint(lvl)}
                          className={cx(
                            "rounded-tile px-3 py-2 text-[13px] font-semibold text-left transition duration-150",
                            levelHint === lvl ? "bg-brand text-white" : "text-mist-400 hover:text-paper"
                          )}
                        >{lvl}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-panel border border-ink-600 bg-ink-800 p-5">
                  <div className="text-sm font-semibold text-paper">Constraints</div>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-tile border border-ink-600 bg-ink-850 p-3">
                      <div className="text-[11px] text-mist-500">Max time</div>
                      <div className="mt-2 flex items-center gap-3">
                        <input type="range" min={40} max={240} step={5} value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))} aria-label="Maximum learning hours" className="w-full accent-brand" />
                        <div className="text-sm font-semibold text-paper w-14 text-right">{maxTime}h</div>
                      </div>
                    </div>

                    <div className="rounded-tile border border-ink-600 bg-ink-850 p-3">
                      <div className="text-[11px] text-mist-500">Max budget</div>
                      <div className="mt-2 flex items-center gap-3">
                        <input type="range" min={0} max={800} step={10} value={maxBudget} onChange={(e) => setMaxBudget(Number(e.target.value))} aria-label="Maximum budget in dollars" className="w-full accent-brand" />
                        <div className="text-sm font-semibold text-paper w-16 text-right">${maxBudget}</div>
                      </div>
                    </div>
                    {result && (
                      <div className="text-[11px] text-mist-600">
                        Constraints changed after generating? Click "Regenerate" to re-run.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-panel border border-ink-600 bg-ink-800 p-5 min-h-[200px]">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-paper">Skill gap analysis</div>
                    {result && (
                      <span className="rounded-full border border-brand/35 bg-brand/12 px-2.5 py-0.5 text-[11px] font-semibold text-brand-hi">
                        {result.gap_analysis.job_readiness}% ready
                      </span>
                    )}
                  </div>

                  {!result && !loading && (
                    <div className="mt-3 text-xs text-mist-500">
                      Click "Generate Learning Path" to run the gap analysis model.
                    </div>
                  )}
                  {loading && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-mist-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Extracting skills and computing gaps…
                    </div>
                  )}

                  {result && (
                    <div className="mt-3 space-y-2">
                      {gaps.length === 0 && (
                        <div className="text-xs text-ok">No significant gaps found for this role.</div>
                      )}
                      {gaps.slice(0, 8).map((g) => (
                        <div key={g.canonical_name} className="rounded-tile border border-ink-600 bg-ink-850 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-paper">{g.canonical_name}</div>
                            <span
                              className={cx(
                                "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                                CRITICALITY_TONE[g.criticality_label] || CRITICALITY_TONE.inferred
                              )}
                            >
                              {(g.criticality_label || "preferred").replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-mist-500">
                            <span>gap {g.effective_gap.toFixed(1)}</span>
                            <span>~{Math.round(g.learning_hours_mean)}h</span>
                            <span>transfer {(g.transferability * 100).toFixed(0)}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-panel border border-ink-600 bg-ink-800 p-5 min-h-[200px]">
                  <div className="text-xs font-semibold text-mist-200 uppercase tracking-wider">Current Proficiency</div>
                  <div className="mt-2 text-xs text-mist-500">
                    {result ? `Extracted from ${selectedEmployee.name}'s profile` : `From ${selectedEmployee.name}'s profile`}
                  </div>

                  {!result ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {(selectedEmployee.skills || []).map((skill, idx) => (
                        <span
                          key={skill}
                          className={cx(
                            "inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium",
                            skillTone(idx)
                          )}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1.5">
                      {resumeSkills.length === 0 && (
                        <div className="text-xs text-mist-500">No skills were extracted from this profile.</div>
                      )}
                      {resumeSkills.slice(0, 10).map((s, idx) => (
                        <div key={s.canonical_name} className="flex items-center gap-2">
                          <span
                            className={cx(
                              "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                              skillTone(idx)
                            )}
                          >
                            {s.canonical_name}
                          </span>
                          <div className="h-1.5 flex-1 rounded-full bg-ink-750">
                            <div
                              className="h-1.5 rounded-full bg-brand"
                              style={{ width: `${(s.proficiency_score / 5) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-[11px] text-mist-500">{s.proficiency_score}/5</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-panel border border-ink-600 bg-ink-800 p-5 min-h-[260px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-paper">Ordered course path</div>
                    {result && (
                      <div className="text-xs text-mist-500 text-right shrink-0">
                        {result.learning_path.total_hours}h - ${result.learning_path.total_cost_usd}
                      </div>
                    )}
                  </div>

                  {!result && !loading && (
                    <div className="mt-3 text-xs text-mist-500">
                      The recommended courses will appear here after generating a learning path.
                    </div>
                  )}

                  {result && (
                    <div className="mt-4 space-y-2">
                      {learningPath.length === 0 && (
                        <div className="text-xs text-mist-500">No courses fit within the current time/budget constraints.</div>
                      )}
                      {learningPath.map((c, idx) => (
                        <div key={`${c.course_id}-${idx}`} className="flex items-stretch gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-7 w-7 rounded-full border border-brand/35 bg-brand/12 text-brand-hi text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </div>
                            {idx < learningPath.length - 1 && <div className="mt-1 w-px flex-1 bg-ink-500" />}
                          </div>
                          <div className="flex-1 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-paper">{c.course_name}</div>
                              <span
                                className={cx(
                                  "rounded-full border px-2 py-0.5 text-[11px]",
                                  c.is_prerequisite_course
                                    ? "border-ink-600 bg-ink-800 text-mist-400"
                                    : "border-brand/35 bg-brand/12 text-brand-hi"
                                )}
                              >
                                {c.is_prerequisite_course ? "Prerequisite" : c.difficulty}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-mist-500">
                              <span>{c.duration_hours}h</span>
                              <span>{c.is_free ? "Free" : `$${c.price_usd}`}</span>
                              <span>for {c.for_gap}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpskillingView;

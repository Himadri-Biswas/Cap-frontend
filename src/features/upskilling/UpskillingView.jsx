import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Database, History, Loader2, Sparkles } from "lucide-react";
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

const CRITICALITY_TONE = {
  required: "border-rose-200 bg-rose-50 text-rose-700",
  strong: "border-orange-200 bg-orange-50 text-orange-700",
  preferred: "border-amber-200 bg-amber-50 text-amber-700",
  nice_to_have: "border-sky-200 bg-sky-50 text-sky-700",
  optional: "border-slate-200 bg-slate-50 text-slate-600",
  inferred: "border-slate-200 bg-slate-50 text-slate-600",
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

  const gaps = result?.gap_analysis?.gaps || [];
  const learningPath = result?.learning_path?.learning_path || [];
  const resumeSkills = result?.resume_skills || [];

  return (
    <div className="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-b from-white to-slate-50 p-6">
        <div className="grid items-start gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="h-[560px] rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Select target job</div>
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
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="mt-3 inline-flex rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-sky-50 to-violet-50 p-1">
              <button
                onClick={() => {
                  setJobMode("select");
                  setCustomJobChecked(false);
                  resetResult();
                }}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  jobMode === "select" ? "bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-sm" : "text-slate-700 hover:bg-white/70"
                )}
              >
                Select Job
              </button>
              <button
                onClick={() => {
                  setJobMode("custom");
                  setTargetJobId(null);
                  resetResult();
                }}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  jobMode === "custom" ? "bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-sm" : "text-slate-700 hover:bg-white/70"
                )}
              >
                Custom Job
              </button>
            </div>

            {jobMode === "select" ? (
              <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
                {jobList.map((j) => {
                  const active = j.id === targetJobId;
                  return (
                    <button
                      key={j.id}
                      onClick={() => {
                        setTargetJobId(j.id);
                        resetResult();
                      }}
                      className={cx(
                        "w-full rounded-2xl border p-4 text-left transition duration-150",
                        active
                          ? "border-indigo-300 bg-gradient-to-br from-indigo-50 to-sky-50 ring-2 ring-indigo-100 shadow-sm"
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      <div className="font-semibold text-slate-900">{j.title}</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 flex-1 flex flex-col gap-3">
                <textarea
                  value={customJobDescription}
                  onChange={(e) => {
                    setCustomJobDescription(e.target.value);
                    setCustomJobChecked(false);
                    resetResult();
                  }}
                  rows={5}
                  className="w-full flex-1 min-h-[220px] resize-none rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-300"
                  placeholder="Write job description (responsibilities, required skills, tools, experience)..."
                />

                <Button
                  onClick={() => setCustomJobChecked(true)}
                  className="w-full rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!customJobDescription.trim()}
                >
                  Check Now
                </Button>
              </div>
            )}
          </div>

          <div className="h-[560px] rounded-3xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Select employee</div>
              {selectedEmployee && (
                <button
                  onClick={() => {
                    setEmployeeId(null);
                    resetResult();
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-3 grid flex-1 auto-rows-min content-start gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {employeeList.map((e) => {
                const active = e.id === employeeId;
                return (
                  <button
                    key={e.id}
                    onClick={() => {
                      setEmployeeId(e.id);
                      resetResult();
                    }}
                    className={cx(
                      "rounded-2xl border p-3 text-left transition duration-150",
                      active
                        ? "border-indigo-300 bg-gradient-to-br from-indigo-50 to-sky-50 ring-2 ring-indigo-100 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold">
                        {e.initials}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900">{e.name}</div>
                        <div className="mt-1">
                          <span className="inline-flex max-w-full truncate rounded-full border border-sky-100 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
                            {e.JobRole}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            {e.Department}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {Boolean(selectedEmployee && (jobMode === "select" ? selectedTargetJob : customJobChecked)) && (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">Recommended learning path</div>
                  {saved && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <Database className="h-3 w-3" />
                      Saved to MongoDB
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {selectedEmployee.name}: {selectedEmployee.JobRole} {"->"} {activeJobTitle}
                </div>
                {pastPaths.length > 0 && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
                    <History className="h-3 w-3" />
                    {pastPaths.length} earlier path{pastPaths.length > 1 ? "s" : ""} for this employee
                    {pastPaths[0]?.jobReadiness != null
                      ? ` · last readiness ${pastPaths[0].jobReadiness}%`
                      : ""}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                  {["Junior", "Mid-Level", "Senior"].map((lvl) => (
                    <button
                      key={lvl}
                      onClick={() => setLevelHint(lvl)}
                      className={cx(
                        "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition",
                        levelHint === lvl ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <Button
                  onClick={handleGenerateLearningPath}
                  className="rounded-2xl bg-indigo-600 px-4 shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loading || !canGenerate}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {result ? "Regenerate" : "Generate Learning Path"}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <div>
                  <div className="text-sm font-semibold text-rose-700">Learning path generation failed</div>
                  <div className="mt-1 text-sm text-rose-600">{error}</div>
                  <div className="mt-1 text-xs text-rose-400">API: {MODULE2_API_URL}</div>
                </div>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">Constraints</div>
                  <div className="mt-4 space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] text-slate-500">Max time</div>
                      <div className="mt-2 flex items-center gap-3">
                        <input type="range" min={40} max={240} step={5} value={maxTime} onChange={(e) => setMaxTime(Number(e.target.value))} className="w-full" />
                        <div className="text-sm font-semibold text-slate-900 w-14 text-right">{maxTime}h</div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] text-slate-500">Max budget</div>
                      <div className="mt-2 flex items-center gap-3">
                        <input type="range" min={0} max={800} step={10} value={maxBudget} onChange={(e) => setMaxBudget(Number(e.target.value))} className="w-full" />
                        <div className="text-sm font-semibold text-slate-900 w-16 text-right">${maxBudget}</div>
                      </div>
                    </div>
                    {result && (
                      <div className="text-[11px] text-slate-400">
                        Constraints changed after generating? Click "Regenerate" to re-run.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-h-[200px]">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">Skill gap analysis</div>
                    {result && (
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                        {result.gap_analysis.job_readiness}% ready
                      </span>
                    )}
                  </div>

                  {!result && !loading && (
                    <div className="mt-3 text-xs text-slate-500">
                      Click "Generate Learning Path" to run the gap analysis model.
                    </div>
                  )}
                  {loading && (
                    <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting skills and computing gaps…
                    </div>
                  )}

                  {result && (
                    <div className="mt-3 space-y-2">
                      {gaps.length === 0 && (
                        <div className="text-xs text-emerald-600">No significant gaps found for this role.</div>
                      )}
                      {gaps.slice(0, 8).map((g) => (
                        <div key={g.canonical_name} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-900">{g.canonical_name}</div>
                            <span
                              className={cx(
                                "rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                                CRITICALITY_TONE[g.criticality_label] || CRITICALITY_TONE.inferred
                              )}
                            >
                              {(g.criticality_label || "preferred").replace(/_/g, " ")}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
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
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-h-[200px]">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Current Proficiency</div>
                  <div className="mt-2 text-xs text-slate-500">
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
                        <div className="text-xs text-slate-500">No skills were extracted from this profile.</div>
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
                          <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-indigo-500"
                              style={{ width: `${(s.proficiency_score / 5) * 100}%` }}
                            />
                          </div>
                          <span className="w-8 text-right text-[11px] text-slate-500">{s.proficiency_score}/5</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-h-[260px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">Ordered course path</div>
                    {result && (
                      <div className="text-xs text-slate-500 text-right shrink-0">
                        {result.learning_path.total_hours}h - ${result.learning_path.total_cost_usd}
                      </div>
                    )}
                  </div>

                  {!result && !loading && (
                    <div className="mt-3 text-xs text-slate-500">
                      The recommended courses will appear here after generating a learning path.
                    </div>
                  )}

                  {result && (
                    <div className="mt-4 space-y-2">
                      {learningPath.length === 0 && (
                        <div className="text-xs text-slate-500">No courses fit within the current time/budget constraints.</div>
                      )}
                      {learningPath.map((c, idx) => (
                        <div key={`${c.course_id}-${idx}`} className="flex items-stretch gap-3">
                          <div className="flex flex-col items-center">
                            <div className="h-7 w-7 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">
                              {idx + 1}
                            </div>
                            {idx < learningPath.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-300" />}
                          </div>
                          <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-semibold text-slate-900">{c.course_name}</div>
                              <span
                                className={cx(
                                  "rounded-full border px-2 py-0.5 text-[11px]",
                                  c.is_prerequisite_course
                                    ? "border-slate-200 bg-white text-slate-600"
                                    : "border-indigo-200 bg-indigo-50 text-indigo-700"
                                )}
                              >
                                {c.is_prerequisite_course ? "Prerequisite" : c.difficulty}
                              </span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
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

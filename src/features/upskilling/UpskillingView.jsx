import React, { useMemo, useState } from "react";
import Button from "../../components/ui/Button.jsx";
import { cx } from "../../lib/cx.js";
import { skillTone } from "../../lib/skillTone.js";

function UpskillingView({ jobs, employees, search, setSearch }) {
  const [targetJobId, setTargetJobId] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [maxTime, setMaxTime] = useState(120);
  const [maxBudget, setMaxBudget] = useState(300);
  const [jobMode, setJobMode] = useState("select");
  const [customJobDescription, setCustomJobDescription] = useState("");
  const [customJobChecked, setCustomJobChecked] = useState(false);

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

  const normalize = (v = "") => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hasTokenOverlap = (a, b) => {
    const aa = new Set(normalize(a).split(" ").filter(Boolean));
    const bb = new Set(normalize(b).split(" ").filter(Boolean));
    for (const t of aa) {
      if (bb.has(t)) return true;
    }
    return false;
  };

  const skillMatchLevel = (employeeSkills = [], skill) => {
    const wanted = normalize(skill);
    let partial = false;
    for (const raw of employeeSkills) {
      const cur = normalize(raw);
      if (!cur) continue;
      if (cur === wanted || cur.includes(wanted) || wanted.includes(cur)) return "strong";
      if (hasTokenOverlap(cur, wanted)) partial = true;
    }
    return partial ? "partial" : "none";
  };

  const plansByJob = {
    J201: {
      title: "Data Scientist transition path",
      proficiency: [
        { skill: "Python", current: 2, target: 4 },
        { skill: "SQL", current: 2, target: 4 },
        { skill: "Statistics", current: 1, target: 4 },
        { skill: "Machine Learning", current: 1, target: 4 },
      ],
      paths: [
        {
          id: "J201-P1",
          label: "Analytics to Modeling",
          etaHours: 104,
          cost: 189,
          steps: [
            { code: "DS-A1", name: "Advanced SQL for Analytics", badge: "Must Have" },
            { code: "DS-A2", name: "Statistical Inference for Product Data", badge: "Must Have" },
            { code: "DS-A3", name: "Supervised Machine Learning", badge: "Must Have" },
            { code: "DS-A4", name: "Model Validation and Monitoring", badge: "Must Have" },
            { code: "DS-A5", name: "Communicating Insights to Stakeholders", badge: "Nice to Have" },
          ],
        },
        {
          id: "J201-P2",
          label: "Applied Data Science",
          etaHours: 96,
          cost: 149,
          steps: [
            { code: "DS-B1", name: "Data Wrangling with Pandas", badge: "Must Have" },
            { code: "DS-B2", name: "Feature Engineering in Practice", badge: "Must Have" },
            { code: "DS-B3", name: "Experimentation and A/B Testing", badge: "Must Have" },
            { code: "DS-B4", name: "ML Project Portfolio Build", badge: "Nice to Have" },
          ],
        },
      ],
    },
    J202: {
      title: "Backend Engineer transition path",
      proficiency: [
        { skill: "Node.js", current: 2, target: 4 },
        { skill: "REST API", current: 2, target: 4 },
        { skill: "PostgreSQL", current: 2, target: 4 },
        { skill: "System Design", current: 1, target: 4 },
        { skill: "CI/CD", current: 1, target: 3 },
      ],
      paths: [
        {
          id: "J202-P1",
          label: "Core Backend Delivery",
          etaHours: 108,
          cost: 199,
          steps: [
            { code: "BE-A1", name: "Node.js Performance and Async Patterns", badge: "Must Have" },
            { code: "BE-A2", name: "REST API Design and Security", badge: "Must Have" },
            { code: "BE-A3", name: "Database Schema and Query Optimization", badge: "Must Have" },
            { code: "BE-A4", name: "Caching with Redis", badge: "Must Have" },
            { code: "BE-A5", name: "CI/CD for Backend Services", badge: "Nice to Have" },
          ],
        },
        {
          id: "J202-P2",
          label: "Scalable Service Architecture",
          etaHours: 98,
          cost: 169,
          steps: [
            { code: "BE-B1", name: "Microservices Fundamentals", badge: "Must Have" },
            { code: "BE-B2", name: "System Design for High Traffic", badge: "Must Have" },
            { code: "BE-B3", name: "Observability and Distributed Tracing", badge: "Must Have" },
            { code: "BE-B4", name: "Containerized Deployments", badge: "Nice to Have" },
          ],
        },
      ],
    },
    J203: {
      title: "Product Designer transition path",
      proficiency: [
        { skill: "UX Research", current: 2, target: 4 },
        { skill: "Wireframing", current: 2, target: 4 },
        { skill: "Prototyping", current: 2, target: 4 },
        { skill: "Design Systems", current: 1, target: 4 },
        { skill: "Accessibility", current: 1, target: 3 },
      ],
      paths: [
        {
          id: "J203-P1",
          label: "User-Centered Design",
          etaHours: 94,
          cost: 159,
          steps: [
            { code: "PD-A1", name: "Discovery and User Research", badge: "Must Have" },
            { code: "PD-A2", name: "Information Architecture and Flows", badge: "Must Have" },
            { code: "PD-A3", name: "High-Fidelity Prototyping", badge: "Must Have" },
            { code: "PD-A4", name: "Usability Testing and Iteration", badge: "Must Have" },
            { code: "PD-A5", name: "Design System Governance", badge: "Nice to Have" },
          ],
        },
        {
          id: "J203-P2",
          label: "Product Design Execution",
          etaHours: 88,
          cost: 139,
          steps: [
            { code: "PD-B1", name: "Interaction Design for Dashboards", badge: "Must Have" },
            { code: "PD-B2", name: "Accessibility Standards in UI", badge: "Must Have" },
            { code: "PD-B3", name: "Figma Handoff Best Practices", badge: "Must Have" },
            { code: "PD-B4", name: "Design Metrics and Outcome Tracking", badge: "Nice to Have" },
          ],
        },
      ],
    },
    J204: {
      title: "ML Engineer (NLP) transition path",
      proficiency: [
        { skill: "Python", current: 2, target: 4 },
        { skill: "PyTorch", current: 1, target: 4 },
        { skill: "Transformers", current: 1, target: 4 },
        { skill: "MLOps", current: 1, target: 3 },
      ],
      paths: [
        {
          id: "J204-P1",
          label: "NLP Production Track",
          etaHours: 118,
          cost: 229,
          steps: [
            { code: "NLP-A1", name: "Python for NLP Preprocessing", badge: "Must Have" },
            { code: "NLP-A2", name: "Transformer Architecture", badge: "Must Have" },
            { code: "NLP-A3", name: "Fine-tuning BERT Models", badge: "Must Have" },
            { code: "NLP-A4", name: "Evaluation and Error Analysis", badge: "Must Have" },
            { code: "NLP-A5", name: "Production Inference and Monitoring", badge: "Nice to Have" },
          ],
        },
        {
          id: "J204-P2",
          label: "NLP Applied Systems",
          etaHours: 110,
          cost: 179,
          steps: [
            { code: "NLP-B1", name: "PyTorch for Deep Learning", badge: "Must Have" },
            { code: "NLP-B2", name: "Text Data Pipelines and Tokenization", badge: "Must Have" },
            { code: "NLP-B3", name: "MLOps for NLP Workflows", badge: "Must Have" },
            { code: "NLP-B4", name: "Retrieval and Vector Databases", badge: "Nice to Have" },
          ],
        },
      ],
    },
    U301: {
      title: "Data Engineer transition path",
      proficiency: [
        { skill: "Python", current: 2, target: 4 },
        { skill: "SQL", current: 2, target: 4 },
        { skill: "Data Modeling", current: 1, target: 4 },
        { skill: "ETL", current: 1, target: 4 },
        { skill: "Airflow", current: 1, target: 3 },
      ],
      paths: [
        {
          id: "U301-P1",
          label: "Batch Data Pipelines",
          etaHours: 112,
          cost: 209,
          steps: [
            { code: "DE-A1", name: "Data Modeling for Warehouses", badge: "Must Have" },
            { code: "DE-A2", name: "Building ETL Pipelines", badge: "Must Have" },
            { code: "DE-A3", name: "Airflow Orchestration", badge: "Must Have" },
            { code: "DE-A4", name: "Data Quality and Validation", badge: "Must Have" },
            { code: "DE-A5", name: "Cloud Data Platform Deployment", badge: "Nice to Have" },
          ],
        },
        {
          id: "U301-P2",
          label: "Streaming and Reliability",
          etaHours: 104,
          cost: 189,
          steps: [
            { code: "DE-B1", name: "Python for Data Engineering", badge: "Must Have" },
            { code: "DE-B2", name: "Advanced SQL for Pipelines", badge: "Must Have" },
            { code: "DE-B3", name: "Workflow Monitoring and Alerting", badge: "Must Have" },
            { code: "DE-B4", name: "Pipeline Optimization", badge: "Nice to Have" },
          ],
        },
      ],
    },
    U302: {
      title: "DevOps Engineer transition path",
      proficiency: [
        { skill: "Linux", current: 2, target: 4 },
        { skill: "CI/CD", current: 2, target: 4 },
        { skill: "Docker", current: 1, target: 4 },
        { skill: "Kubernetes", current: 1, target: 3 },
        { skill: "Monitoring", current: 1, target: 3 },
      ],
      paths: [
        {
          id: "U302-P1",
          label: "Platform Automation",
          etaHours: 106,
          cost: 199,
          steps: [
            { code: "DO-A1", name: "Linux Administration for Production", badge: "Must Have" },
            { code: "DO-A2", name: "CI/CD Pipeline Automation", badge: "Must Have" },
            { code: "DO-A3", name: "Containerization with Docker", badge: "Must Have" },
            { code: "DO-A4", name: "Kubernetes Core Operations", badge: "Must Have" },
            { code: "DO-A5", name: "Monitoring and Incident Response", badge: "Nice to Have" },
          ],
        },
        {
          id: "U302-P2",
          label: "Cloud Reliability",
          etaHours: 98,
          cost: 179,
          steps: [
            { code: "DO-B1", name: "Infrastructure as Code Basics", badge: "Must Have" },
            { code: "DO-B2", name: "Release Management Workflow", badge: "Must Have" },
            { code: "DO-B3", name: "Observability and SLOs", badge: "Must Have" },
            { code: "DO-B4", name: "Cost and Capacity Optimization", badge: "Nice to Have" },
          ],
        },
      ],
    },
    U303: {
      title: "Product Manager transition path",
      proficiency: [
        { skill: "Product Strategy", current: 2, target: 4 },
        { skill: "User Stories", current: 2, target: 4 },
        { skill: "Roadmapping", current: 2, target: 4 },
        { skill: "Analytics", current: 1, target: 3 },
        { skill: "Communication", current: 2, target: 4 },
      ],
      paths: [
        {
          id: "U303-P1",
          label: "PM Core Execution",
          etaHours: 92,
          cost: 149,
          steps: [
            { code: "PM-A1", name: "Problem Framing and Product Discovery", badge: "Must Have" },
            { code: "PM-A2", name: "Writing Clear PRDs and User Stories", badge: "Must Have" },
            { code: "PM-A3", name: "Roadmap and Prioritization", badge: "Must Have" },
            { code: "PM-A4", name: "Cross-functional Delivery", badge: "Must Have" },
            { code: "PM-A5", name: "Stakeholder Communication", badge: "Nice to Have" },
          ],
        },
        {
          id: "U303-P2",
          label: "Outcome-driven PM",
          etaHours: 88,
          cost: 139,
          steps: [
            { code: "PM-B1", name: "Product Metrics and KPI Design", badge: "Must Have" },
            { code: "PM-B2", name: "Experimentation for Product Decisions", badge: "Must Have" },
            { code: "PM-B3", name: "Go-to-Market Collaboration", badge: "Must Have" },
            { code: "PM-B4", name: "Quarterly Planning Cadence", badge: "Nice to Have" },
          ],
        },
      ],
    },
  };

  const knownSkills = useMemo(() => {
    const all = new Set();
    upskillingTargetJobs.forEach((j) => (j.skills || []).forEach((s) => all.add(s)));
    employees.forEach((e) => (e.skills || []).forEach((s) => all.add(s)));
    return Array.from(all);
  }, [upskillingTargetJobs, employees]);

  const customSkillsList = useMemo(() => {
    const desc = customJobDescription.trim();
    if (!desc) return [];
    const normalizedDesc = normalize(desc);
    const matches = knownSkills.filter((skill) => {
      const normalizedSkill = normalize(skill);
      return normalizedDesc.includes(normalizedSkill) || hasTokenOverlap(normalizedDesc, normalizedSkill);
    });
    return Array.from(new Set(matches)).slice(0, 6);
  }, [customJobDescription, knownSkills]);

  const customJobData = useMemo(() => {
    if (!customJobChecked) return null;
    const skills = customSkillsList.length ? customSkillsList : ["Python", "SQL", "Communication"];

    const planEntries = Object.values(plansByJob);
    const bestTemplate =
      planEntries
        .map((p) => ({
          p,
          overlap: (p.proficiency || []).filter((x) => skills.some((s) => hasTokenOverlap(s, x.skill))).length,
        }))
        .sort((a, b) => b.overlap - a.overlap)[0]?.p || plansByJob.J201;

    const addedLoad = Math.max(0, skills.length - 4);
    return {
      title: "Custom Job",
      proficiency: skills.slice(0, 6).map((skill) => ({ skill, current: 1, target: 4 })),
      paths: (bestTemplate.paths || []).map((p, idx) => ({
        ...p,
        id: `CUSTOM-P${idx + 1}`,
        label: `Custom Path ${idx + 1}`,
        etaHours: p.etaHours + addedLoad * 6,
        cost: p.cost + addedLoad * 20,
      })),
    };
  }, [customJobChecked, customSkillsList]);

  const jobData = jobMode === "select" ? (selectedTargetJob ? plansByJob[selectedTargetJob.id] : null) : customJobData;
  const activeJobTitle = jobMode === "select" ? selectedTargetJob?.title : "Custom Job";
  const canShowRecommendations = Boolean(
    selectedEmployee &&
      jobData &&
      (jobMode === "select" ? selectedTargetJob : customJobChecked)
  );

  const filteredPaths = useMemo(() => {
    if (!jobData) return [];
    return (jobData.paths || []).filter((p) => p.etaHours <= maxTime && p.cost <= maxBudget);
  }, [jobData, maxTime, maxBudget]);

  const proficiencyRows = useMemo(() => {
    if (!jobData) return [];
    const required = jobData.proficiency || [];
    if (!selectedEmployee) return required;
    return required.map((p) => {
      const match = skillMatchLevel(selectedEmployee.skills || [], p.skill);
      const current = match === "strong" ? Math.max(3, p.target - 1) : match === "partial" ? Math.max(2, p.target - 2) : 1;
      return { ...p, current, match };
    });
  }, [jobData, selectedEmployee]);

  const getStepFocus = (stepName, requiredSkills) => {
    const found = (requiredSkills || []).find((r) => hasTokenOverlap(stepName, r.skill));
    return found ? found.skill : "Core";
  };

  const displayPaths = filteredPaths.length ? filteredPaths : jobData?.paths || [];
  const pathOne = displayPaths[0] || null;
  const pathTwo = displayPaths[1] || null;

  const PathCard = ({ path, title }) => {
    if (!path) {
      return (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
          No path fits current constraints.
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">{title || path.label}</div>
            <div className="text-xs text-slate-500 mt-1">Estimated: {path.etaHours}h - ${path.cost}</div>
          </div>
          <Button className="rounded-2xl bg-indigo-600 hover:bg-indigo-700">Recommend</Button>
        </div>

        <div className="mt-4 space-y-2">
          {path.steps.map((s, idx) => (
            <div key={s.code} className="flex items-stretch gap-3">
              <div className="flex flex-col items-center">
                <div className="h-7 w-7 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </div>
                {idx < path.steps.length - 1 && <div className="mt-1 w-px flex-1 bg-slate-300" />}
              </div>
              <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-900">{s.name}</div>
                  <span
                    className={cx(
                      "rounded-full border px-2 py-0.5 text-[11px]",
                      s.badge === "Must Have" ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    {s.badge}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Focus: {getStepFocus(s.name, proficiencyRows)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const jobList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return upskillingTargetJobs;
    return upskillingTargetJobs.filter((j) => `${j.title} ${j.dept} ${j.location}`.toLowerCase().includes(q));
  }, [upskillingTargetJobs, search]);

  const employeeList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => `${e.name} ${e.role} ${e.email}`.toLowerCase().includes(q));
  }, [employees, search]);

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
                      onClick={() => setTargetJobId(j.id)}
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
                <button onClick={() => setEmployeeId(null)} className="text-xs text-slate-500 hover:text-slate-700">
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
                    onClick={() => setEmployeeId(e.id)}
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
                            {e.role}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                            {e.dept}
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

        {canShowRecommendations && (
          <div className="mt-4">
            <div className="mb-3">
              <div className="text-sm font-semibold text-slate-900">Recommended learning paths</div>
              <div className="text-xs text-slate-500 mt-1">
                {selectedEmployee.name}: {selectedEmployee.role} {"->"} {activeJobTitle}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-h-[260px]">
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
                  </div>
                </div>

                <PathCard path={pathOne} title="Path 1" />
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm min-h-[260px]">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Current Proficiency</div>
                  <div className="mt-2 text-xs text-slate-500">From {selectedEmployee.name}'s profile</div>
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
                </div>

                <PathCard path={pathTwo} title="Path 2" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default UpskillingView;

import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Calendar, CheckCircle2, Search, XCircle } from "lucide-react";
import Input from "../../components/ui/Input.jsx";
import Pill from "../../components/ui/Pill.jsx";
import SoftTag from "../../components/ui/SoftTag.jsx";
import { cx } from "../../lib/cx.js";
import { mockApplicantsByJob } from "./mockApplicantsByJob.js";

function JobPostsOnly({ jobs, search, setSearch }) {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  const now = new Date(Date.UTC(2026, 1, 10, 12, 0, 0)); // demo "today"

  const deadlineUTC = (yyyy_mm_dd) => {
    const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  };

  const normalizeSkill = (v = "") => v.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const isSkillMatch = (candidateSkill, requiredSkill) => {
    const c = normalizeSkill(candidateSkill);
    const r = normalizeSkill(requiredSkill);
    if (!c || !r) return false;
    return c === r || c.includes(r) || r.includes(c);
  };

  const getApplicantCount = (jobId) => (mockApplicantsByJob[jobId] || []).length;

  const scoreCandidate = (candidate, job) => {
    const requiredSkills = job?.skills || [];
    if (!requiredSkills.length) return { score: 0.5, matchedSkills: [], matchPct: 0 };

    const matchedSkills = candidate.skills.filter((s) => requiredSkills.some((r) => isSkillMatch(s, r)));
    const ratio = matchedSkills.length / requiredSkills.length;
    const score = Math.min(0.98, Math.max(0.45, 0.45 + ratio * 0.55));
    return {
      score: Number(score.toFixed(2)),
      matchedSkills,
      matchPct: Math.round(ratio * 100),
    };
  };

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = !q
      ? jobs
      : jobs.filter((j) => `${j.title} ${j.dept} ${j.location}`.toLowerCase().includes(q));

    return base
      .slice()
      .sort((a, b) => {
        const aClo = deadlineUTC(a.deadline) < now;
        const bClo = deadlineUTC(b.deadline) < now;
        if (aClo !== bClo) return aClo ? 1 : -1;
        return deadlineUTC(b.deadline) - deadlineUTC(a.deadline);
      });
  }, [jobs, search]);

  useEffect(() => {
    if (selectedJobId && !filteredJobs.find((j) => j.id === selectedJobId)) {
      setSelectedJobId(null);
      setSelectedCandidateId(null);
    }
  }, [filteredJobs, selectedJobId]);

  const selected = selectedJobId ? filteredJobs.find((j) => j.id === selectedJobId) || null : null;
  const applicants = selected ? mockApplicantsByJob[selected.id] || [] : [];

  const rankedApplicants = useMemo(() => {
    if (!selected) return [];
    return applicants
      .map((a) => {
        const matched = scoreCandidate(a, selected);
        const unmatched = a.skills.filter((s) => !matched.matchedSkills.includes(s));
        return {
          ...a,
          score: matched.score,
          matchPct: matched.matchPct,
          matchedSkills: matched.matchedSkills,
          displaySkills: [...matched.matchedSkills, ...unmatched],
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((a, idx) => ({ ...a, rank: idx + 1 }));
  }, [applicants, selected]);

  useEffect(() => {
    // Do not auto-select a candidate. Candidate details appear only after clicking a row.
    if (!selectedJobId) {
      setSelectedCandidateId(null);
    }
  }, [selectedJobId]);

  const selectedCandidate = rankedApplicants.find((c) => c.id === selectedCandidateId) || null;

  const statusPill = (j) => {
    const isClo = deadlineUTC(j.deadline) < now;
    return isClo
      ? { label: "Closed", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle }
      : { label: "Ongoing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: CheckCircle2 };
  };

  const JobList = ({ compact }) => (
    <div className={cx("rounded-3xl border border-slate-200 bg-white p-4 shadow-sm", compact && "h-fit")}> 
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Latest Job Posts</div>
        <Pill className="bg-slate-100 text-slate-700 border border-slate-200">{filteredJobs.length} job posts</Pill>
      </div>

      <div className="mt-3 space-y-3">
        {filteredJobs.map((j) => {
          const s = statusPill(j);
          const Icon = s.icon;
          const isSelected = selectedJobId === j.id;

          return (
            <button
              key={j.id}
              onClick={() => {
                setSelectedJobId(j.id);
                setSelectedCandidateId(null);
              }}
              className={cx(
                "w-full rounded-2xl border p-3 text-left transition",
                isSelected
                  ? "bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-200"
                  : "bg-white hover:bg-slate-50 border-slate-200"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cx("mt-1 h-10 w-1.5 rounded-full", isSelected ? "bg-indigo-600" : "bg-slate-200")} />
                  <div>
                    <div className="font-semibold text-slate-900">{j.title}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {j.dept} • {j.location}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Pill className={cx("border", s.cls)}>
                    <Icon className="h-3.5 w-3.5 mr-1" /> {s.label}
                  </Pill>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Pill className="bg-slate-100 text-slate-700 border border-slate-200">
                  <Calendar className="h-3.5 w-3.5 mr-1" /> Deadline: {j.deadline}
                </Pill>
                <Pill className="bg-slate-100 text-slate-700 border border-slate-200">Applicants: {getApplicantCount(j.id)}</Pill>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search for jobs */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
          <Search className="h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 bg-transparent focus-visible:ring-0"
            placeholder="Search jobs by title, dept, location..."
          />
        </div>
      </div>

      {/* IMPORTANT: no reserved columns. If no job selected, show only list full width. */}
      {!selected ? (
        <div>
          <JobList />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.05fr_0.95fr]">
          {/* Job list shrinks when selected */}
          <JobList compact />

          {/* Job details */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Job Details</div>
              <button
                onClick={() => {
                  setSelectedJobId(null);
                  setSelectedCandidateId(null);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                Back
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-bold tracking-tight text-slate-900">{selected.title}</div>
                  <div className="text-sm text-slate-500 mt-1">
                    {selected.dept} • {selected.location}
                  </div>
                </div>
                <div className="text-right">
                  {(() => {
                    const s = statusPill(selected);
                    const Icon = s.icon;
                    return (
                      <Pill className={cx("border", s.cls)}>
                        <Icon className="h-3.5 w-3.5 mr-1" /> {s.label}
                      </Pill>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Summary</div>
                <div className="text-sm text-slate-700 mt-2">{selected.summary}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Key skills</div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selected.skills.map((s) => (
                    <SoftTag key={s}>{s}</SoftTag>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-3 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Posted</div>
                    <div className="font-semibold text-slate-900">{selected.created}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Deadline</div>
                    <div className="font-semibold text-slate-900">{selected.deadline}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Applicants</div>
                    <div className="font-semibold text-slate-900">{getApplicantCount(selected.id)}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  className="w-full rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800"
                >
                  View Job Details
                </button>
              </div>
            </div>
          </div>

          {/* Applicants */}
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Applicants</div>
              <Pill className="bg-slate-100 text-slate-700 border border-slate-200">{rankedApplicants.length} applicants</Pill>
            </div>

            {rankedApplicants.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No applicants yet for this job.
              </div>
            ) : (
              <div className="mt-3 space-y-4">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-600">
                        <th className="px-3 py-2 font-semibold w-14">Rank</th>
                        <th className="px-3 py-2 font-semibold">Candidate Name</th>
                        <th className="px-3 py-2 font-semibold w-36">Candidate Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedApplicants.map((c) => {
                        const isActive = c.id === selectedCandidateId;
                        return (
                          <tr
                            key={c.id}
                            className={cx(
                              "cursor-pointer border-t border-slate-200",
                              isActive ? "bg-indigo-50" : "hover:bg-slate-50"
                            )}
                            onClick={() => setSelectedCandidateId(c.id)}
                          >
                            <td className="px-3 py-2 font-mono text-slate-700">{c.rank}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3">
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white font-bold flex items-center justify-center">
                                  {c.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((x) => x[0])
                                    .join("")}
                                </div>
                                <div className="font-semibold text-slate-900">{c.name}</div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-indigo-600"
                                    style={{ width: `${Math.round(c.score * 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-700">{(c.score * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {!selectedCandidate ? (
                    <></>
                  ) : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-bold text-slate-900">{selectedCandidate.name}</div>
                        </div>
                        <Pill className="bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Score: {(selectedCandidate.score * 100).toFixed(0)}%
                        </Pill>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">Skills</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedCandidate.displaySkills.map((s) => {
                            const isMatched = selectedCandidate.matchedSkills.includes(s);
                            return (
                              <span
                                key={s}
                                className={cx(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-xs",
                                  isMatched
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                                )}
                              >
                                {s}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800"
                        >
                          View CV
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default JobPostsOnly;

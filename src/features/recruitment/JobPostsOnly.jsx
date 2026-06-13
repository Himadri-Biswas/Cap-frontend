import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  Upload,
  UsersRound,
  XCircle,
} from "lucide-react";
import Button from "../../components/ui/Button.jsx";
import Pill from "../../components/ui/Pill.jsx";
import { cx } from "../../lib/cx.js";
import { mockApplicantsByJob } from "./mockApplicantsByJob.js";

const MODULE1_API_URL = import.meta.env.VITE_MODULE1_API_URL || "https://ijsasif-module-1-skill-extractor.hf.space";
const MODULE1_RANKING_API_URL =
  import.meta.env.VITE_MODULE1_RANKING_API_URL || "https://ijsasif-module-1-ranking-debiasing.hf.space";

const DEFAULT_RANKING_JD =
  "We are seeking a Data Analyst to analyze business data, build dashboards, and generate actionable insights. Requirements: 3+ years of Python, SQL, data visualization experience. Familiarity with pandas, scikit-learn, Tableau. Strong analytical and communication skills.";

const SKILL_CATEGORY_META = {
  "programming language": {
    label: "Programming Languages",
    className: "border-blue-200 bg-blue-50 text-blue-700",
  },
  framework: {
    label: "Frameworks and Libraries",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  database: {
    label: "Databases",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "devops tool": {
    label: "Cloud and DevOps",
    className: "border-violet-200 bg-violet-50 text-violet-700",
  },
  "machine learning concept": {
    label: "ML and AI Concepts",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
  "soft skill": {
    label: "Soft Skills",
    className: "border-slate-200 bg-slate-100 text-slate-700",
  },
  methodology: {
    label: "Methodologies",
    className: "border-teal-200 bg-teal-50 text-teal-700",
  },
};

const SKILL_CATEGORY_ORDER = [
  "programming language",
  "framework",
  "database",
  "devops tool",
  "machine learning concept",
  "soft skill",
  "methodology",
];

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatCategoryLabel(category) {
  return category
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatScore(value) {
  return typeof value === "number" ? value.toFixed(4) : "-";
}

function JobPostsOnly({ jobs, search }) {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [cvFile, setCvFile] = useState(null);
  const [cvResult, setCvResult] = useState(null);
  const [cvError, setCvError] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [rankingJobTitle, setRankingJobTitle] = useState("Data Analyst");
  const [rankingJobDescription, setRankingJobDescription] = useState(DEFAULT_RANKING_JD);
  const [rankingJdFile, setRankingJdFile] = useState(null);
  const [rankingCvFiles, setRankingCvFiles] = useState([]);
  const [rankingResult, setRankingResult] = useState(null);
  const [rankingError, setRankingError] = useState("");
  const [rankingLoading, setRankingLoading] = useState(false);
  const fileInputRef = useRef(null);
  const rankingJdInputRef = useRef(null);
  const rankingCvInputRef = useRef(null);

  const now = new Date(Date.UTC(2026, 1, 10, 12, 0, 0)); // demo "today"

  const deadlineUTC = (yyyy_mm_dd) => {
    const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 23, 59, 59));
  };

  const normalizeSkill = (value = "") => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const isSkillMatch = (candidateSkill, requiredSkill) => {
    const candidate = normalizeSkill(candidateSkill);
    const required = normalizeSkill(requiredSkill);
    if (!candidate || !required) return false;
    return candidate === required || candidate.includes(required) || required.includes(candidate);
  };

  const getApplicantCount = (jobId) => (mockApplicantsByJob[jobId] || []).length;

  const scoreCandidate = (candidate, job) => {
    const requiredSkills = job?.skills || [];
    if (!requiredSkills.length) return { score: 0.5, matchedSkills: [], matchPct: 0 };

    const matchedSkills = candidate.skills.filter((skill) => requiredSkills.some((required) => isSkillMatch(skill, required)));
    const ratio = matchedSkills.length / requiredSkills.length;
    const score = Math.min(0.98, Math.max(0.45, 0.45 + ratio * 0.55));
    return {
      score: Number(score.toFixed(2)),
      matchedSkills,
      matchPct: Math.round(ratio * 100),
    };
  };

  const filteredJobs = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = !query
      ? jobs
      : jobs.filter((job) => `${job.title} ${job.dept} ${job.location}`.toLowerCase().includes(query));

    return base
      .slice()
      .sort((a, b) => {
        const aClosed = deadlineUTC(a.deadline) < now;
        const bClosed = deadlineUTC(b.deadline) < now;
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
        return deadlineUTC(b.deadline) - deadlineUTC(a.deadline);
      });
  }, [jobs, search]);

  useEffect(() => {
    if (selectedJobId && !filteredJobs.find((job) => job.id === selectedJobId)) {
      setSelectedJobId(null);
      setSelectedCandidateId(null);
    }
  }, [filteredJobs, selectedJobId]);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedCandidateId(null);
    }
  }, [selectedJobId]);

  const selected = selectedJobId ? filteredJobs.find((job) => job.id === selectedJobId) || null : null;
  const applicants = selected ? mockApplicantsByJob[selected.id] || [] : [];

  const rankedApplicants = useMemo(() => {
    if (!selected) return [];
    return applicants
      .map((applicant) => {
        const matched = scoreCandidate(applicant, selected);
        const unmatched = applicant.skills.filter((skill) => !matched.matchedSkills.includes(skill));
        return {
          ...applicant,
          score: matched.score,
          matchPct: matched.matchPct,
          matchedSkills: matched.matchedSkills,
          displaySkills: [...matched.matchedSkills, ...unmatched],
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((applicant, index) => ({ ...applicant, rank: index + 1 }));
  }, [applicants, selected]);

  const selectedCandidate = rankedApplicants.find((candidate) => candidate.id === selectedCandidateId) || null;

  const extractedSkillSections = useMemo(() => {
    const categorized = cvResult?.categorized || {};
    const knownSections = SKILL_CATEGORY_ORDER.filter((category) => categorized[category]?.length).map((category) => ({
      category,
      label: SKILL_CATEGORY_META[category]?.label || formatCategoryLabel(category),
      className: SKILL_CATEGORY_META[category]?.className || "border-slate-200 bg-slate-50 text-slate-700",
      items: categorized[category],
    }));
    const extraSections = Object.entries(categorized)
      .filter(([category, items]) => !SKILL_CATEGORY_ORDER.includes(category) && items?.length)
      .map(([category, items]) => ({
        category,
        label: formatCategoryLabel(category),
        className: "border-slate-200 bg-slate-50 text-slate-700",
        items,
      }));
    return [...knownSections, ...extraSections];
  }, [cvResult]);

  const statusPill = (job) => {
    const isClosed = deadlineUTC(job.deadline) < now;
    return isClosed
      ? { label: "Closed", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle }
      : { label: "Ongoing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: CheckCircle2 };
  };

  const module1Endpoint = `${MODULE1_API_URL.replace(/\/$/, "")}/extract-skills?mode=gliner`;
  const rankingEndpoint = `${MODULE1_RANKING_API_URL.replace(/\/$/, "")}/rank-candidates/upload`;

  async function handleExtractCvSkills() {
    if (!cvFile) return;

    setCvLoading(true);
    setCvError("");
    setCvResult(null);

    try {
      const formData = new FormData();
      formData.append("file", cvFile);

      const response = await fetch(module1Endpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Module 1 API error ${response.status}`);
      }

      const data = await response.json();
      setCvResult(data);
    } catch (error) {
      setCvError(error.message || "Failed to reach the Module 1 skill extraction API.");
    } finally {
      setCvLoading(false);
    }
  }

  function handleChooseFile(file) {
    if (!file) return;
    setCvFile(file);
    setCvError("");
    setCvResult(null);
  }

  function resetCvUpload() {
    setCvFile(null);
    setCvResult(null);
    setCvError("");
    setCvLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleRankingCvFiles(files) {
    const nextFiles = Array.from(files || []);
    if (!nextFiles.length) return;
    setRankingCvFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const unique = nextFiles.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...current, ...unique];
    });
    setRankingError("");
    setRankingResult(null);
  }

  function removeRankingCvFile(fileToRemove) {
    setRankingCvFiles((current) => current.filter((file) => file !== fileToRemove));
    setRankingResult(null);
  }

  function resetRankingUpload() {
    setRankingJdFile(null);
    setRankingCvFiles([]);
    setRankingResult(null);
    setRankingError("");
    setRankingLoading(false);
    if (rankingJdInputRef.current) rankingJdInputRef.current.value = "";
    if (rankingCvInputRef.current) rankingCvInputRef.current.value = "";
  }

  async function handleRankCandidates() {
    setRankingError("");
    setRankingResult(null);

    if (!rankingJobDescription.trim() && !rankingJdFile) {
      setRankingError("Paste a job description or upload a JD file.");
      return;
    }
    if (!rankingCvFiles.length) {
      setRankingError("Upload at least one structured candidate CV.");
      return;
    }

    setRankingLoading(true);
    try {
      const formData = new FormData();
      formData.append("job_title", rankingJobTitle.trim() || "Untitled Role");
      formData.append("job_description", rankingJobDescription.trim());
      if (rankingJdFile) {
        formData.append("jd_file", rankingJdFile);
      }
      rankingCvFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(rankingEndpoint, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Ranking API error ${response.status}`);
      }

      const data = await response.json();
      setRankingResult(data);
    } catch (error) {
      setRankingError(error.message || "Failed to rank candidates.");
    } finally {
      setRankingLoading(false);
    }
  }

  const JobList = ({ compact }) => (
    <div className={cx("rounded-3xl border border-slate-200 bg-white p-4 shadow-sm", compact && "h-fit")}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Latest Job Posts</div>
        <Pill className="border border-slate-200 bg-slate-100 text-slate-700">{filteredJobs.length} job posts</Pill>
      </div>

      <div className="mt-3 space-y-3">
        {filteredJobs.map((job) => {
          const status = statusPill(job);
          const Icon = status.icon;
          const isSelected = selectedJobId === job.id;

          return (
            <button
              key={job.id}
              onClick={() => {
                setSelectedJobId(job.id);
                setSelectedCandidateId(null);
              }}
              className={cx(
                "w-full rounded-2xl border p-3 text-left transition",
                isSelected
                  ? "border-indigo-300 bg-indigo-50/80 ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className={cx("mt-1 h-10 w-1.5 rounded-full", isSelected ? "bg-indigo-600" : "bg-slate-200")} />
                  <div>
                    <div className="font-semibold text-slate-900">{job.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {job.dept} / {job.location}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <Pill className={cx("border", status.cls)}>
                    <Icon className="mr-1 h-3.5 w-3.5" /> {status.label}
                  </Pill>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                  <Calendar className="mr-1 h-3.5 w-3.5" /> Deadline: {job.deadline}
                </Pill>
                <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                  Applicants: {getApplicantCount(job.id)}
                </Pill>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-sky-500 to-cyan-400 text-white shadow-lg shadow-indigo-200/70">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-slate-900">CV Skill Extraction</div>
            {cvFile ? <div className="mt-1 text-xs font-medium text-slate-500">{cvFile.name} / {formatFileSize(cvFile.size)}</div> : null}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-[30px] border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-sky-100 p-[1px]">
          <div className="rounded-[29px] bg-gradient-to-br from-indigo-50 via-white to-sky-50 p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(event) => handleChooseFile(event.target.files?.[0] || null)}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative flex w-full flex-col items-center justify-center overflow-hidden rounded-[28px] border border-white/80 bg-white/95 px-6 py-10 text-center shadow-[0_20px_50px_-28px_rgba(79,70,229,0.45)] transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-[0_28px_70px_-30px_rgba(79,70,229,0.55)]"
            >
              <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-indigo-200 to-transparent" />
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-100 via-sky-100 to-cyan-100 text-indigo-700 transition group-hover:scale-105">
                <Upload className="h-6 w-6" />
              </div>
              <div className="mt-5 text-lg font-semibold text-slate-900">{cvFile ? "Replace CV" : "Upload CV"}</div>
              <div className="mt-2 text-sm text-slate-500">
                {cvFile ? "Choose another file to refresh the extracted skills." : "PDF, DOCX, or TXT"}
              </div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700">
                Choose file
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </div>
            </button>

            {cvFile && (
              <div className="mt-4 flex flex-col gap-3 rounded-[24px] border border-slate-200 bg-white/95 p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{cvFile.name}</div>
                    <div className="text-xs text-slate-500">{formatFileSize(cvFile.size)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={resetCvUpload}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear
                  </button>
                  <Button
                    onClick={handleExtractCvSkills}
                    className="rounded-2xl bg-indigo-600 px-4 shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={cvLoading}
                  >
                    {cvLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Extract Skills
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {cvError && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4">
            <div className="text-sm font-semibold text-rose-700">Skill extraction failed</div>
            <div className="mt-1 text-sm text-rose-600">{cvError}</div>
          </div>
        )}

        {cvResult && !cvLoading && (
          <div className="mt-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Total skills</div>
                <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{cvResult.total || 0}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Categories</div>
                <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{extractedSkillSections.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Extractor</div>
                <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                  {(cvResult.extractor || "gliner").toUpperCase()}
                </div>
                <div className="mt-1 text-xs text-slate-500">{cvResult.filename || cvFile?.name}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Extracted Skills</div>
                <div className="text-xs text-slate-500">{cvResult.filename || cvFile?.name}</div>
              </div>

              {extractedSkillSections.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  No categorized skills were returned by the Module 1 backend for this CV.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {extractedSkillSections.map((section) => (
                    <div key={section.category}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">{section.label}</div>
                        <div className="text-xs text-slate-500">{section.items.length} skills</div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {section.items.map((item) => (
                          <span
                            key={`${section.category}-${item.name}`}
                            className={cx(
                              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                              section.className
                            )}
                          >
                            <span>{item.name}</span>
                            {typeof item.score === "number" && (
                              <span className="font-mono opacity-70">{Math.round(item.score * 100)}%</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight text-slate-900">Candidate Ranking</div>
              <div className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Before / after debiasing</div>
            </div>
          </div>
          {rankingResult && (
            <Pill className="w-fit border border-emerald-200 bg-emerald-50 text-emerald-700">
              {rankingResult.fairness_summary?.improvement?.spread_reduction_pct}% spread reduction
            </Pill>
          )}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Job title</span>
              <input
                value={rankingJobTitle}
                onChange={(event) => setRankingJobTitle(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 outline-none transition focus:border-slate-400"
              />
            </label>

            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
              <input
                ref={rankingJdInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(event) => {
                  setRankingJdFile(event.target.files?.[0] || null);
                  setRankingResult(null);
                  setRankingError("");
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Job Description</div>
                  <div className="mt-1 text-xs text-slate-500">Upload JD or paste text below.</div>
                </div>
                <button
                  type="button"
                  onClick={() => rankingJdInputRef.current?.click()}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Upload JD
                </button>
              </div>

              {rankingJdFile && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{rankingJdFile.name}</div>
                    <div className="text-xs text-slate-500">{formatFileSize(rankingJdFile.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRankingJdFile(null);
                      if (rankingJdInputRef.current) rankingJdInputRef.current.value = "";
                    }}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Remove
                  </button>
                </div>
              )}

              <textarea
                value={rankingJobDescription}
                onChange={(event) => {
                  setRankingJobDescription(event.target.value);
                  setRankingResult(null);
                }}
                rows={8}
                placeholder="Paste job description here if no JD file is uploaded..."
                className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-slate-400"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
            <input
              ref={rankingCvInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              multiple
              className="hidden"
              onChange={(event) => handleRankingCvFiles(event.target.files)}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <UsersRound className="h-4 w-4 text-slate-500" />
                Candidate CVs
              </div>
              <button
                type="button"
                onClick={() => rankingCvInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload CVs
              </button>
            </div>

            <button
              type="button"
              onClick={() => rankingCvInputRef.current?.click()}
              className="group mt-4 flex min-h-[210px] w-full flex-col items-center justify-center rounded-[26px] border border-dashed border-slate-300 bg-white px-6 py-8 text-center transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg hover:shadow-slate-200/60"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-900 text-white transition group-hover:scale-105">
                <Upload className="h-5 w-5" />
              </div>
              <div className="mt-4 text-base font-semibold text-slate-900">Upload structured CV files</div>
              <div className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                CVs should include labels like Name, University, University Tier, Gender, Skin Color, and Ethnicity.
              </div>
              <div className="mt-4 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-700">
                PDF, DOCX, or TXT / multiple files
              </div>
            </button>

            {rankingCvFiles.length > 0 && (
              <div className="mt-4 space-y-2">
                {rankingCvFiles.map((file, index) => (
                  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{file.name}</div>
                        <div className="text-xs text-slate-500">{formatFileSize(file.size)}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRankingCvFile(file)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              {rankingError ? <div className="text-sm font-medium text-rose-600">{rankingError}</div> : <div />}
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={resetRankingUpload}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
                <Button
                  onClick={handleRankCandidates}
                  className="rounded-2xl bg-slate-900 px-4 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={rankingLoading}
                >
                  {rankingLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Ranking
                    </>
                  ) : (
                    <>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Extract & Rank
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {rankingResult && (
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Parsed Candidate Profiles</div>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {rankingResult.candidates?.map((candidate) => (
                  <div key={candidate.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="font-semibold text-slate-900">{candidate.name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {[
                        candidate.demographics?.university,
                        candidate.demographics?.university_tier,
                        candidate.demographics?.gender,
                        candidate.demographics?.skin_color,
                        candidate.demographics?.ethnicity,
                      ].map((value, valueIndex) => (
                        <Pill key={`${candidate.id}-${valueIndex}-${value || "unknown"}`} className="border border-slate-200 bg-white text-slate-700">
                          {value || "Unknown"}
                        </Pill>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Before spread</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  {formatScore(rankingResult.fairness_summary?.before_debiasing?.score_spread)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs text-slate-500">After spread</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  {formatScore(rankingResult.fairness_summary?.after_debiasing?.score_spread)}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs text-emerald-700">Reduction</div>
                <div className="mt-1 text-2xl font-bold tracking-tight text-emerald-800">
                  {rankingResult.fairness_summary?.improvement?.spread_reduction_pct ?? 0}%
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Candidate</th>
                    <th className="px-3 py-2 font-semibold">Before</th>
                    <th className="px-3 py-2 font-semibold">After</th>
                    <th className="px-3 py-2 font-semibold">Rank shift</th>
                    <th className="px-3 py-2 font-semibold">Bias removed</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingResult.candidates?.map((candidate) => {
                    const shift = candidate.bias_analysis?.rank_change || 0;
                    return (
                      <tr key={candidate.id} className="border-t border-slate-200 bg-white">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">{candidate.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{candidate.bias_analysis?.fairness_status}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono text-slate-900">{formatScore(candidate.step1_biased?.final_biased_score)}</div>
                          <div className="text-xs text-slate-500">Rank #{candidate.step1_biased?.rank}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono text-slate-900">{formatScore(candidate.step2_fair?.fair_similarity)}</div>
                          <div className="text-xs text-slate-500">Rank #{candidate.step2_fair?.rank}</div>
                        </td>
                        <td className="px-3 py-3">
                          <Pill
                            className={cx(
                              "border",
                              shift > 0
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : shift < 0
                                  ? "border-amber-200 bg-amber-50 text-amber-700"
                                  : "border-slate-200 bg-slate-100 text-slate-700"
                            )}
                          >
                            {shift > 0 ? `+${shift}` : shift}
                          </Pill>
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-700">
                          {candidate.bias_analysis?.bias_removed_pct ?? 0}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {!selected ? (
        <div>
          <JobList />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.75fr_1.05fr_0.95fr]">
          <JobList compact />

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
                  <div className="mt-1 text-sm text-slate-500">
                    {selected.dept} / {selected.location}
                  </div>
                </div>
                <div className="text-right">
                  {(() => {
                    const status = statusPill(selected);
                    const Icon = status.icon;
                    return (
                      <Pill className={cx("border", status.cls)}>
                        <Icon className="mr-1 h-3.5 w-3.5" /> {status.label}
                      </Pill>
                    );
                  })()}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">Summary</div>
                <div className="mt-2 text-sm text-slate-700">{selected.summary}</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">Key skills</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-3 text-sm md:grid-cols-3">
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
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  View Job Details
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Applicants</div>
              <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                {rankedApplicants.length} applicants
              </Pill>
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
                        <th className="w-14 px-3 py-2 font-semibold">Rank</th>
                        <th className="px-3 py-2 font-semibold">Candidate Name</th>
                        <th className="w-36 px-3 py-2 font-semibold">Candidate Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedApplicants.map((candidate) => {
                        const isActive = candidate.id === selectedCandidateId;
                        return (
                          <tr
                            key={candidate.id}
                            className={cx(
                              "cursor-pointer border-t border-slate-200",
                              isActive ? "bg-indigo-50" : "hover:bg-slate-50"
                            )}
                            onClick={() => setSelectedCandidateId(candidate.id)}
                          >
                            <td className="px-3 py-2 font-mono text-slate-700">{candidate.rank}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 font-bold text-white">
                                  {candidate.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join("")}
                                </div>
                                <div className="font-semibold text-slate-900">{candidate.name}</div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-indigo-600"
                                    style={{ width: `${Math.round(candidate.score * 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-700">{(candidate.score * 100).toFixed(0)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  {!selectedCandidate ? null : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-bold text-slate-900">{selectedCandidate.name}</div>
                        </div>
                        <Pill className="border border-indigo-200 bg-indigo-50 text-indigo-700">
                          Score: {(selectedCandidate.score * 100).toFixed(0)}%
                        </Pill>
                      </div>

                      <div className="mt-3">
                        <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">Skills</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedCandidate.displaySkills.map((skill) => {
                            const isMatched = selectedCandidate.matchedSkills.includes(skill);
                            return (
                              <span
                                key={skill}
                                className={cx(
                                  "inline-flex items-center rounded-full border px-3 py-1 text-xs",
                                  isMatched
                                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                                    : "border-slate-200 bg-slate-50 text-slate-700"
                                )}
                              >
                                {skill}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="mt-4">
                        <button
                          type="button"
                          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
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

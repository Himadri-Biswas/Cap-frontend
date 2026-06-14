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

function titleFromFilename(filename) {
  const noExt = filename.replace(/\.[^/.]+$/, "");
  const noPrefix = noExt.replace(/^(\d+|jd)[_\-\s]+/i, "");
  const noSuffix = noPrefix.replace(/[_\-\s]+(jd|position|role|description)$/i, "");
  return noSuffix.replace(/[_\-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

const SKILL_CATEGORY_META = {
  "programming language":                  { label: "Languages",     className: "border-blue-200 bg-blue-50 text-blue-700" },
  "framework or library":                  { label: "Frameworks",    className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  "database or data store":                { label: "Databases",     className: "border-amber-200 bg-amber-50 text-amber-700" },
  "cloud or devops tool":                  { label: "Cloud/DevOps",  className: "border-violet-200 bg-violet-50 text-violet-700" },
  "machine learning or AI concept":        { label: "ML & AI",       className: "border-rose-200 bg-rose-50 text-rose-700" },
  "soft skill":                            { label: "Soft Skills",   className: "border-slate-200 bg-slate-100 text-slate-700" },
  "methodology or process":                { label: "Methodology",   className: "border-teal-200 bg-teal-50 text-teal-700" },
  "cybersecurity and network security tool": { label: "Security",    className: "border-red-200 bg-red-50 text-red-700" },
  "software testing and QA automation tool": { label: "Testing/QA",  className: "border-orange-200 bg-orange-50 text-orange-700" },
  "data visualization or BI tool":         { label: "Data Viz & BI", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  "big data or pipeline technology":       { label: "Big Data/ETL",  className: "border-cyan-200 bg-cyan-50 text-cyan-700" },
  "design or prototyping tool":            { label: "Design Tools",  className: "border-pink-200 bg-pink-50 text-pink-700" },
  "blockchain or web3 technology":         { label: "Blockchain",    className: "border-purple-200 bg-purple-50 text-purple-700" },
};

const SKILL_CATEGORY_ORDER = [
  "programming language",
  "framework or library",
  "database or data store",
  "cloud or devops tool",
  "machine learning or AI concept",
  "soft skill",
  "methodology or process",
  "cybersecurity and network security tool",
  "software testing and QA automation tool",
  "data visualization or BI tool",
  "big data or pipeline technology",
  "design or prototyping tool",
  "blockchain or web3 technology",
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

function getSkillSections(skillPayload) {
  const categorized = skillPayload?.categorized || {};
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
}

function JobPostsOnly({ jobs, search }) {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);
  const [cvFile, setCvFile] = useState(null);
  const [cvResult, setCvResult] = useState(null);
  const [cvError, setCvError] = useState("");
  const [cvLoading, setCvLoading] = useState(false);
  const [rankingJobTitle, setRankingJobTitle] = useState("");
  const [rankingJobDescription, setRankingJobDescription] = useState("");
  const [rankingJdFile, setRankingJdFile] = useState(null);
  const [rankingCvFiles, setRankingCvFiles] = useState([]);
  const [rankingResult, setRankingResult] = useState(null);
  const [rankingError, setRankingError] = useState("");
  const [rankingLoading, setRankingLoading] = useState(false);
  const [rankingSkills, setRankingSkills] = useState(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [jdExtracting, setJdExtracting] = useState(false);
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

  useEffect(() => {
    if (!rankingResult?.candidates?.length) {
      setRankingSkills(null);
      return;
    }
    let cancelled = false;
    setSkillsLoading(true);
    (async () => {
      try {
        const texts = [rankingJobDescription, ...rankingResult.candidates.map((c) => c.resume || "")];
        const results = await Promise.all(
          texts.map(async (text) => {
            if (!text?.trim()) return null;
            try {
              const r = await fetch(extractTextEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text }),
              });
              return r.ok ? r.json() : null;
            } catch {
              return null;
            }
          })
        );
        if (!cancelled) {
          const [jdSkills, ...cvSkills] = results;
          const candidateSkillMap = {};
          rankingResult.candidates.forEach((c, i) => { candidateSkillMap[c.id] = cvSkills[i]; });
          setRankingSkills({ jdSkills, candidateSkills: candidateSkillMap });
        }
      } catch {
        // skill extraction is best-effort; don't break ranking results
      } finally {
        if (!cancelled) setSkillsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rankingResult]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return getSkillSections(cvResult);
  }, [cvResult]);

  const statusPill = (job) => {
    const isClosed = deadlineUTC(job.deadline) < now;
    return isClosed
      ? { label: "Closed", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle }
      : { label: "Ongoing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: CheckCircle2 };
  };

  const module1Endpoint = `${MODULE1_API_URL.replace(/\/$/, "")}/extract-skills?mode=gliner`;
  const extractTextEndpoint = `${MODULE1_API_URL.replace(/\/$/, "")}/extract-text`;
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
    setRankingJobTitle("");
    setRankingJobDescription("");
    setRankingJdFile(null);
    setRankingCvFiles([]);
    setRankingResult(null);
    setRankingError("");
    setRankingLoading(false);
    setRankingSkills(null);
    setSkillsLoading(false);
    if (rankingJdInputRef.current) rankingJdInputRef.current.value = "";
    if (rankingCvInputRef.current) rankingCvInputRef.current.value = "";
  }

  async function handleRankingJdFileChange(file) {
    if (!file) return;
    setRankingJdFile(file);
    setRankingResult(null);
    setRankingError("");
    setJdExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const r = await fetch(`${MODULE1_API_URL.replace(/\/$/, "")}/read-file`, {
        method: "POST",
        body: formData,
      });
      if (r.ok) {
        const data = await r.json();
          if (data.text?.trim()) {
        setRankingJobDescription(data.text.trim());
        setRankingJobTitle(titleFromFilename(file.name));
      }
      }
    } catch {
      // best-effort — user can still paste manually
    } finally {
      setJdExtracting(false);
    }
  }

  async function handleRankCandidates() {
    setRankingError("");
    setRankingResult(null);

    if (!rankingJobDescription.trim()) {
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
      <div className="hidden">
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
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-base font-semibold tracking-tight text-slate-900">Fair Candidate Screener</div>
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-4">
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
                  const file = event.target.files?.[0] || null;
                  if (file) handleRankingJdFileChange(file);
                  event.target.value = "";
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Job Description</div>
                  {jdExtracting && (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Loader2 className="h-3 w-3 animate-spin" /> Extracting text…
                    </div>
                  )}
                </div>
                {rankingJdFile ? (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => rankingJdInputRef.current?.click()}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Change
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRankingJdFile(null);
                        setRankingJobTitle("");
                        setRankingJobDescription("");
                      }}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => rankingJdInputRef.current?.click()}
                    className="shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Upload JD
                  </button>
                )}
              </div>

              <textarea
                value={rankingJobDescription}
                onChange={(event) => {
                  setRankingJobDescription(event.target.value);
                  setRankingResult(null);
                }}
                rows={8}
                placeholder="Paste job description here…"
                className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-slate-400"
              />
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
          <div className="mt-6 space-y-4">
            {/* 1. Parsed Candidate Profiles */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 text-sm font-semibold text-slate-900">Parsed Candidate Profiles</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {rankingResult.candidates?.map((candidate) => {
                  const isPriv = candidate.bias_analysis?.was_privileged;
                  const isDis = candidate.bias_analysis?.was_disadvantaged;
                  return (
                    <div key={candidate.id} className={cx(
                      "rounded-2xl border p-3",
                      isPriv ? "border-amber-200 bg-amber-50/40" : isDis ? "border-rose-200 bg-rose-50/40" : "border-slate-200 bg-slate-50"
                    )}>
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-slate-900">{candidate.name}</div>
                        <span className={cx(
                          "text-xs font-semibold",
                          isPriv ? "text-amber-600" : isDis ? "text-rose-600" : "text-slate-400"
                        )}>
                          {isPriv ? "privileged" : isDis ? "disadvantaged" : "neutral"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[
                          candidate.demographics?.university,
                          candidate.demographics?.university_tier,
                          candidate.demographics?.gender,
                          candidate.demographics?.skin_color,
                          candidate.demographics?.ethnicity,
                        ].map((value, i) => (
                          <Pill key={i} className="border border-slate-200 bg-white text-xs text-slate-600">
                            {value || "Unknown"}
                          </Pill>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Full Ranking Results */}
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Full Ranking Results</div>
              <table className="w-full text-sm">
                <thead className="border-t border-slate-100 bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Candidate</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Before</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">After</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Shift</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Verdict</th>
                    <th className="px-4 py-2.5 text-xs font-semibold text-slate-600">Bias removed</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingResult.candidates?.map((candidate) => {
                    const shift = candidate.bias_analysis?.rank_change || 0;
                    const verdict = candidate.step2_fair?.verdict;
                    const verdictCls =
                      verdict === "SHORTLISTED" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : verdict === "STRONG MATCH" ? "border-teal-200 bg-teal-50 text-teal-700"
                      : verdict === "MATCH" ? "border-blue-200 bg-blue-50 text-blue-700"
                      : verdict === "WEAK MATCH" ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-rose-200 bg-rose-50 text-rose-700";
                    return (
                      <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{candidate.name}</div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {candidate.demographics?.university} · {candidate.demographics?.gender} · {candidate.demographics?.ethnicity}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-slate-900">{formatScore(candidate.step1_biased?.final_biased_score)}</div>
                          <div className="text-xs text-slate-400">Rank #{candidate.step1_biased?.rank}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-emerald-700">{formatScore(candidate.step2_fair?.fair_similarity)}</div>
                          <div className="text-xs text-slate-400">Rank #{candidate.step2_fair?.rank}</div>
                        </td>
                        <td className="px-4 py-3">
                          <Pill className={cx(
                            "border font-semibold",
                            shift > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : shift < 0 ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-200 bg-slate-100 text-slate-500"
                          )}>
                            {shift > 0 ? `+${shift}` : shift}
                          </Pill>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", verdictCls)}>{verdict}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-700">
                          {candidate.bias_analysis?.bias_removed_pct ?? 0}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 3. Rank Journey */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 text-sm font-semibold text-slate-900">Rank Journey</div>
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_40px_1fr] gap-2 pb-1">
                  <div className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">Before</div>
                  <div />
                  <div className="text-center text-xs font-semibold uppercase tracking-wider text-slate-400">After</div>
                </div>
                {rankingResult.candidates?.map((candidate) => {
                  const shift = candidate.bias_analysis?.rank_change || 0;
                  const isPriv = candidate.bias_analysis?.was_privileged;
                  const isDis = candidate.bias_analysis?.was_disadvantaged;
                  const beforeCls = isPriv
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : isDis
                      ? "border-rose-200 bg-rose-50 text-rose-800"
                      : "border-slate-200 bg-slate-50 text-slate-700";
                  const afterCls = shift > 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : shift < 0
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-slate-200 bg-slate-50 text-slate-600";
                  return (
                    <div key={candidate.id} className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
                      <div className={cx("rounded-xl border px-2 py-2 text-center text-xs font-semibold", beforeCls)}>
                        #{candidate.step1_biased?.rank} {candidate.name.split(" ")[0]}
                      </div>
                      <div className={cx(
                        "text-center text-sm font-bold",
                        shift > 0 ? "text-emerald-600" : shift < 0 ? "text-amber-600" : "text-slate-400"
                      )}>
                        {shift > 0 ? `↑${shift}` : shift < 0 ? `↓${Math.abs(shift)}` : "→"}
                      </div>
                      <div className={cx("rounded-xl border px-2 py-2 text-center text-xs font-semibold", afterCls)}>
                        #{candidate.step2_fair?.rank} {candidate.name.split(" ")[0]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. Fairness Impact Banner */}
            <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Fairness Impact</div>
                  <div className="mt-1 text-5xl font-bold tabular-nums text-emerald-400">
                    {rankingResult.fairness_summary?.improvement?.spread_reduction_pct ?? 0}%
                  </div>
                  <div className="mt-1.5 text-sm text-slate-300">
                    Score spread:{" "}
                    <span className="font-mono font-semibold text-white">
                      {formatScore(rankingResult.fairness_summary?.before_debiasing?.score_spread)}
                    </span>
                    {" → "}
                    <span className="font-mono font-semibold text-emerald-400">
                      {formatScore(rankingResult.fairness_summary?.after_debiasing?.score_spread)}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <div className="text-xs font-medium text-slate-400">Most improved</div>
                    <div className="mt-1 text-sm font-semibold text-white">
                      {rankingResult.fairness_summary?.improvement?.most_improved}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-4 py-3">
                    <div className="text-xs font-medium text-slate-400">Shortlisted after</div>
                    <div className="mt-1 text-xl font-bold text-emerald-400">
                      {rankingResult.fairness_summary?.after_debiasing?.shortlisted_count}
                      <span className="ml-1 text-sm font-normal text-slate-300">
                        / {rankingResult.fairness_summary?.total_candidates}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Score Comparison Bar Chart */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Score Comparison — Biased vs Fair</div>
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" />
                    Biased
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Fair
                  </span>
                </div>
              </div>
              <div className="space-y-5">
                {rankingResult.candidates?.map((candidate) => {
                  const biasedScore = candidate.step1_biased?.final_biased_score ?? 0;
                  const fairScore = candidate.step2_fair?.fair_similarity ?? 0;
                  const isPriv = candidate.bias_analysis?.was_privileged;
                  const isDis = candidate.bias_analysis?.was_disadvantaged;
                  return (
                    <div key={candidate.id}>
                      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="font-semibold text-slate-900">{candidate.name}</span>
                        <span className={cx(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          isPriv ? "bg-amber-50 text-amber-700" : isDis ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"
                        )}>
                          {isPriv ? "privileged" : isDis ? "disadvantaged" : "neutral"}
                        </span>
                        <span className="ml-auto text-xs text-slate-400">
                          {candidate.demographics?.university} · {candidate.demographics?.gender} · {candidate.demographics?.ethnicity}
                        </span>
                      </div>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="w-12 shrink-0 text-right text-xs text-slate-400">Biased</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${biasedScore * 100}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold text-amber-700">{biasedScore.toFixed(4)}</span>
                        <span className="w-8 shrink-0 text-xs text-slate-400">#{candidate.step1_biased?.rank}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-12 shrink-0 text-right text-xs text-slate-400">Fair</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" style={{ width: `${fairScore * 100}%` }} />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold text-emerald-700">{fairScore.toFixed(4)}</span>
                        <span className="w-8 shrink-0 text-xs text-slate-400">#{candidate.step2_fair?.rank}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bias Breakdown per Candidate */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 text-sm font-semibold text-slate-900">Bias Breakdown per Candidate</div>
              <div className="space-y-3">
                {rankingResult.candidates?.map((candidate) => {
                  const adj = candidate.step1_biased?.demographic_adjustments;
                  const totalBefore = adj?.total ?? 0;
                  const totalAfter = adj?.after?.total ?? 0;
                  const biasRemovedPct = candidate.bias_analysis?.bias_removed_pct ?? 0;
                  const isPriv = candidate.bias_analysis?.was_privileged;
                  const isDis = candidate.bias_analysis?.was_disadvantaged;
                  const ATTRS = [
                    { label: "University", key: "university" },
                    { label: "Gender", key: "gender" },
                    { label: "Skin Color", key: "skin_color" },
                    { label: "Ethnicity", key: "ethnicity" },
                  ];
                  const fmtAdj = (v) => `${v > 0 ? "+" : ""}${(v ?? 0).toFixed(3)}`;
                  const adjCls = (v) =>
                    v > 0 ? "text-amber-600" : v < 0 ? "text-rose-600" : "text-slate-400";
                  return (
                    <div key={candidate.id} className={cx(
                      "rounded-xl border p-3",
                      isPriv ? "border-amber-200 bg-amber-50/30" : isDis ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-slate-50"
                    )}>
                      <div className="mb-3">
                        <span className="text-sm font-semibold text-slate-900">{candidate.name}</span>
                      </div>
                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                              <th className="px-3 py-2">Bias Factor</th>
                              <th className="px-3 py-2 text-right">Before</th>
                              <th className="px-3 py-2 text-right">After</th>
                              <th className="px-3 py-2 text-right">Removed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ATTRS.map(({ label, key }) => {
                              const before = adj?.[key] ?? 0;
                              const after = adj?.after?.[key] ?? 0;
                              const removedPct = adj?.after_removed_pct?.[key] ?? 0;
                              return (
                                <tr key={key} className="border-t border-slate-100">
                                  <td className="px-3 py-2 font-medium text-slate-700">{label}</td>
                                  <td className={cx("px-3 py-2 text-right font-mono font-semibold", adjCls(before))}>
                                    {fmtAdj(before)}
                                  </td>
                                  <td className={cx("px-3 py-2 text-right font-mono font-semibold", adjCls(after))}>
                                    {fmtAdj(after)}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {removedPct >= 90
                                      ? <span className="font-semibold text-emerald-600">✓ {removedPct}%</span>
                                      : <span className="text-slate-500">{removedPct}%</span>}
                                  </td>
                                </tr>
                              );
                            })}
                            <tr className="border-t-2 border-slate-200 bg-slate-50">
                              <td className="px-3 py-2 font-semibold text-slate-900">Total bias penalty</td>
                              <td className={cx("px-3 py-2 text-right font-mono font-semibold", adjCls(totalBefore))}>
                                {fmtAdj(totalBefore)}
                              </td>
                              <td className={cx("px-3 py-2 text-right font-mono font-semibold", adjCls(totalAfter))}>
                                {fmtAdj(totalAfter)}
                              </td>
                              <td className={cx(
                                "px-3 py-2 text-right font-semibold",
                                biasRemovedPct >= 60 ? "text-emerald-700" : "text-slate-500"
                              )}>
                                {biasRemovedPct}% reduction
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Skill Analysis */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-semibold text-slate-900">Skill Analysis</span>
                </div>
                {skillsLoading && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting skills…
                  </div>
                )}
              </div>

              {skillsLoading && !rankingSkills && (
                <div className="space-y-2">
                  {[1, 2, 3].map((n) => <div key={n} className="h-6 animate-pulse rounded-xl bg-slate-100" />)}
                </div>
              )}

              {!skillsLoading && !rankingSkills && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">
                  Skill data unavailable — check the skill extractor API connection.
                </div>
              )}

              {rankingSkills && (
                <div className="space-y-6">
                  {rankingSkills.jdSkills?.total > 0 && (
                    <div>
                      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Required Skills — {rankingSkills.jdSkills.total} extracted from JD
                      </div>
                      <div className="space-y-2">
                        {SKILL_CATEGORY_ORDER.filter((cat) => rankingSkills.jdSkills.categorized?.[cat]?.length).map((cat) => {
                          const meta = SKILL_CATEGORY_META[cat];
                          return (
                            <div key={cat} className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                              <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                {meta?.label || cat}
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {rankingSkills.jdSkills.categorized[cat].map((item) => (
                                  <span
                                    key={item.name}
                                    className={cx(
                                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                      meta?.className || "border-slate-200 bg-slate-50 text-slate-700"
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
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Candidate Skill Profiles
                    </div>
                    <div className="space-y-3">
                      {rankingResult.candidates
                        ?.slice()
                        .sort((a, b) => (a.step2_fair?.rank ?? 99) - (b.step2_fair?.rank ?? 99))
                        .map((candidate) => {
                          const skills = rankingSkills.candidateSkills?.[candidate.id];
                          if (!skills) return null;
                          const jdNames = (rankingSkills.jdSkills?.skills || []).map((s) => normalizeSkill(s.name));
                          const matched = (skills.skills || []).filter((s) =>
                            jdNames.some((jd) => isSkillMatch(s.name, jd))
                          );
                          const matchPct = jdNames.length > 0 ? Math.round((matched.length / jdNames.length) * 100) : 0;
                          const isPriv = candidate.bias_analysis?.was_privileged;
                          const isDis = candidate.bias_analysis?.was_disadvantaged;
                          const candidateSkillSections = getSkillSections(skills);
                          return (
                            <div
                              key={candidate.id}
                              className={cx(
                                "rounded-xl border p-3",
                                isPriv ? "border-amber-200 bg-amber-50/30" : isDis ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-slate-50"
                              )}
                            >
                              <div className="mb-2">
                                <span className="font-semibold text-slate-900">{candidate.name}</span>
                              </div>
                              {candidateSkillSections.length === 0 ? (
                                <div className="rounded-xl border border-slate-100 bg-white/70 p-3 text-xs text-slate-400">
                                  No categorized skills returned for this CV.
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {candidateSkillSections.map((section) => (
                                    <div key={`${candidate.id}-${section.category}`}>
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                          {section.label}
                                        </div>
                                        <div className="text-[10px] text-slate-400">{section.items.length} skills</div>
                                      </div>
                                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {section.items.map((item) => {
                                          const isRequired = jdNames.some((jd) => isSkillMatch(item.name, jd));
                                          return (
                                            <span
                                              key={`${candidate.id}-${section.category}-${item.name}`}
                                              className={cx(
                                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                                                section.className,
                                                isRequired && "ring-1 ring-current/20"
                                              )}
                                            >
                                              {isRequired && <CheckCircle2 className="h-3 w-3" />}
                                              <span>{item.name}</span>
                                              {typeof item.score === "number" && (
                                                <span className="font-mono opacity-70">{Math.round(item.score * 100)}%</span>
                                              )}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
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

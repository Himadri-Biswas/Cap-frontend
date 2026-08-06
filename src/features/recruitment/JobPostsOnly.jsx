import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Ban,
  CheckCircle2,
  ChevronDown,
  Eye,
  Loader2,
  Mail,
  Minus,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  XCircle,
} from "lucide-react";
import Pill from "../../components/ui/Pill.jsx";
import Modal from "../../components/ui/Modal.jsx";
import CvViewer from "../../components/CvViewer.jsx";
import ApplicantTags, { LastAppliedNote, TONE_BAR_CLASS, TONE_ROW_CLASS, tagTone } from "../../components/ApplicantTags.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";

const MODULE1_API_URL = import.meta.env.VITE_MODULE1_API_URL || "https://ijsasif-module-1-skill-extractor.hf.space";

/**
 * AI verdict bands, applied to the FAIR (post-debiasing) score.
 * 0.62 is also what the ranking backend reports as `metadata.match_threshold`,
 * so the two never disagree unless the backend itself is retuned.
 */
const VERDICT_BANDS = { high: 0.95, shortlist: 0.62, weak: 0.55 };

function aiVerdict(score, shortlistAt = VERDICT_BANDS.shortlist) {
  if (typeof score !== "number") {
    return { label: "NO SCORE", cls: "border-slate-200 bg-slate-100 text-slate-500", note: "The model returned no fair score for this CV." };
  }
  const pct = (score * 100).toFixed(1);
  if (score >= VERDICT_BANDS.high) {
    return {
      label: "HIGHLY PROBABLE",
      cls: "border-teal-300 bg-teal-50 text-teal-800",
      note: `${pct}% match, at or above ${VERDICT_BANDS.high * 100}%.`,
    };
  }
  if (score >= shortlistAt) {
    return {
      label: "SHORTLISTED",
      cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      note: `${pct}% match, clears the ${(shortlistAt * 100).toFixed(0)}% bar.`,
    };
  }
  if (score >= VERDICT_BANDS.weak) {
    return {
      label: "WEAK MATCH",
      cls: "border-amber-200 bg-amber-50 text-amber-700",
      note: `${pct}% match, under the ${(shortlistAt * 100).toFixed(0)}% bar. Worth reading by hand.`,
    };
  }
  return {
    label: "REJECTED",
    cls: "border-rose-200 bg-rose-50 text-rose-700",
    note: `${pct}% match, below the ${VERDICT_BANDS.weak * 100}% floor.`,
  };
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

/** The four protected attributes the ranking backend adjusts scores on. */
const BIAS_FACTORS = [
  { key: "university", label: "University" },
  { key: "gender", label: "Gender" },
  { key: "skin_color", label: "Skin colour" },
  { key: "ethnicity", label: "Ethnicity" },
];

function formatCategoryLabel(category) {
  return category
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatScore(value) {
  return typeof value === "number" ? value.toFixed(4) : "—";
}

/** Signed, fixed-width adjustment: +0.120 / -0.150 / 0.000. */
function formatAdjustment(value, digits = 3) {
  const n = Number(value ?? 0);
  return `${n > 0 ? "+" : n < 0 ? "" : " "}${n.toFixed(digits)}`;
}

function adjustmentClass(value) {
  const n = Number(value ?? 0);
  if (n > 0.0005) return "text-amber-600";
  if (n < -0.0005) return "text-rose-600";
  return "text-slate-400";
}

/**
 * A module-1 skill payload carries both a flat `skills` array and a
 * `categorized` map. Either can be the populated one, so read both and
 * de-duplicate on the skill name.
 */
function flattenSkillItems(skillPayload) {
  if (!skillPayload) return [];
  const byName = new Map();
  const add = (item) => {
    if (!item?.name) return;
    const key = item.name.toLowerCase();
    const existing = byName.get(key);
    if (!existing || (item.score ?? 0) > (existing.score ?? 0)) byName.set(key, item);
  };
  for (const item of skillPayload.skills || []) add(item);
  for (const [category, items] of Object.entries(skillPayload.categorized || {})) {
    for (const item of items || []) add({ ...item, category: item.category || category });
  }
  return [...byName.values()];
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

/** Small reusable shell so every result block reads as one numbered story. */
function Section({ step, title, caption, children, className = "" }) {
  return (
    <section className={cx("rounded-3xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="flex items-start gap-3">
        {step != null && (
          <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-bold text-white">
            {step}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight text-slate-900">{title}</h3>
          {caption ? <p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const TH = ({ children, align = "left", className = "" }) => (
  <th
    className={cx(
      "px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500",
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      className
    )}
  >
    {children}
  </th>
);

function ScrollTable({ children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[540px] text-sm">{children}</table>
    </div>
  );
}

const PAGE_STEP = 5;

function SeeMoreButton({ remaining, step, onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900",
        className
      )}
    >
      <ChevronDown className="h-3.5 w-3.5" />
      See {Math.min(step, remaining)} more
      <span className="font-normal text-slate-400">({remaining} left)</span>
    </button>
  );
}

/**
 * Shows `step` rows at a time behind a "See more" control.
 *
 * Each instance owns its own count, so every table on the screening page pages
 * independently. `resetKey` (the run id) collapses them all back to the first
 * page when a new screening is run.
 */
function PagedBody({ columns, items, row, step = PAGE_STEP, resetKey }) {
  const [shown, setShown] = useState(step);
  useEffect(() => setShown(step), [resetKey, step]);
  const remaining = items.length - shown;

  return (
    <>
      <tbody>{items.slice(0, shown).map(row)}</tbody>
      {remaining > 0 && (
        <tfoot>
          <tr>
            <td colSpan={columns} className="border-t border-slate-100 bg-slate-50/60 p-0">
              <SeeMoreButton remaining={remaining} step={step} onClick={() => setShown((s) => s + step)} />
            </td>
          </tr>
        </tfoot>
      )}
    </>
  );
}

/** Same idea for the sections that are stacked cards rather than a table. */
function PagedList({ items, row, step = PAGE_STEP, resetKey, className = "space-y-3" }) {
  const [shown, setShown] = useState(step);
  useEffect(() => setShown(step), [resetKey, step]);
  const remaining = items.length - shown;

  return (
    <div className="space-y-3">
      <div className={className}>{items.slice(0, shown).map(row)}</div>
      {remaining > 0 && (
        <SeeMoreButton
          remaining={remaining}
          step={step}
          onClick={() => setShown((s) => s + step)}
          className="rounded-2xl border border-slate-200 bg-white"
        />
      )}
    </div>
  );
}

function JobPostsOnly({ jobs, search, focusJobId = null, onJobsChanged, onNewJob }) {
  /**
   * Three separate screens rather than one long scroll:
   *   "list"      — the job postings
   *   "job"       — one posting's details, with its applicants underneath
   *   "screening" — the fair-ranking report for that posting
   */
  const [view, setView] = useState("list");
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState(null);

  // Stop / reopen / delete on a posting
  const [jobBusyId, setJobBusyId] = useState(null);
  const [jobError, setJobError] = useState("");
  const [jobNotice, setJobNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ── Applications loaded from MongoDB for the selected job ────────────────
  const [applicants, setApplicants] = useState([]);
  const [applicantsLoading, setApplicantsLoading] = useState(false);
  const [applicantsError, setApplicantsError] = useState("");
  const [cvModal, setCvModal] = useState(null); // the candidate whose CV is open
  const [statusBusy, setStatusBusy] = useState(null);
  const [statusNotice, setStatusNotice] = useState("");

  // ── Fair screening (module 1) — driven ONLY by "Fair-screen these N" ──────
  const [storedScreenLoading, setStoredScreenLoading] = useState(false);
  const [rankingResult, setRankingResult] = useState(null);
  const [rankingError, setRankingError] = useState("");
  const [screenedJob, setScreenedJob] = useState({ title: "", description: "" });
  const [rankingSkills, setRankingSkills] = useState(null);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [screenTab, setScreenTab] = useState("scoring"); // "scoring" | "skills"
  const [skillCandidateId, setSkillCandidateId] = useState(null);
  const resultsRef = useRef(null);
  /**
   * Set when a ranking result already arrived with its skill sets attached
   * (the stored-CV screening path), so the best-effort skill-extraction effect
   * below does not immediately re-request what we already have.
   */
  const skillsPreloaded = useRef(false);

  /**
   * The real clock, not a frozen demo date.
   *
   * This used to be pinned to 2026-02-10, so a posting whose deadline had
   * genuinely passed still showed "Ongoing" here while the server — which has
   * always used the real time — treated it as closed. The two sides disagreeing
   * about whether a posting was live is what made Stop and Delete behave
   * inconsistently. The applicant portal already reads `Date.now()`.
   */
  const now = new Date();

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

  // Counts now come from the denormalised counter MongoDB keeps on each job.
  const getApplicantCount = (jobId) => {
    if (selectedJobId === jobId && applicants.length) return applicants.length;
    return jobs.find((j) => j.id === jobId)?.applicantCount ?? 0;
  };

  const scoreCandidate = (candidate, job) => {
    const requiredSkills = job?.skills || [];
    if (!requiredSkills.length) return { score: 0.5, matchedSkills: [], matchPct: 0 };

    const matchedSkills = (candidate.skills || []).filter((skill) => requiredSkills.some((required) => isSkillMatch(skill, required)));
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
    // A screening result belongs to the job it was run for — switching jobs
    // must not leave another job's ranking on screen.
    setRankingResult(null);
    setRankingSkills(null);
    setRankingError("");
    setScreenTab("scoring");
    setSkillCandidateId(null);
  }, [selectedJobId]);

  // A notification deep-link ("open job J201") lands here.
  const focusHandled = useRef(null);
  useEffect(() => {
    if (!focusJobId || focusHandled.current === focusJobId) return;
    if (jobs.some((j) => j.id === focusJobId)) {
      focusHandled.current = focusJobId;
      setSelectedJobId(focusJobId);
      setSelectedCandidateId(null);
      setView("job");
    }
  }, [focusJobId, jobs]);

  // ── Load this job's applications from MongoDB ───────────────────────────
  const loadApplicants = React.useCallback(async (jobId) => {
    if (!jobId) {
      setApplicants([]);
      return;
    }
    setApplicantsLoading(true);
    setApplicantsError("");
    try {
      const data = await api.applications.listForJob(jobId);
      setApplicants(data.applications || []);
    } catch (err) {
      setApplicantsError(err.message || "Could not load applicants.");
      setApplicants([]);
    } finally {
      setApplicantsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApplicants(selectedJobId);
  }, [selectedJobId, loadApplicants]);

  const extractTextEndpoint = `${MODULE1_API_URL.replace(/\/$/, "")}/extract-text`;

  // Fallback skill extraction — only runs if the server did not preload them.
  useEffect(() => {
    if (!rankingResult?.candidates?.length) {
      setRankingSkills(null);
      return undefined;
    }
    if (skillsPreloaded.current) {
      skillsPreloaded.current = false;
      return undefined;
    }
    let cancelled = false;
    setSkillsLoading(true);
    (async () => {
      try {
        const texts = [screenedJob.description, ...rankingResult.candidates.map((c) => c.resume || "")];
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

  const rankedApplicants = useMemo(() => {
    if (!selected) return [];
    return applicants
      .map((applicant) => {
        const matched = scoreCandidate(applicant, selected);
        const unmatched = (applicant.skills || []).filter((skill) => !matched.matchedSkills.includes(skill));
        // A real module-1 fair-ranking score always beats the local heuristic.
        const hasMlScore = applicant.scoreSource && applicant.scoreSource !== "heuristic";
        return {
          ...applicant,
          score: hasMlScore ? applicant.score : matched.score,
          matchPct: applicant.matchPct ?? matched.matchPct,
          matchedSkills: applicant.matchedSkills?.length ? applicant.matchedSkills : matched.matchedSkills,
          displaySkills: [...matched.matchedSkills, ...unmatched],
          tone: tagTone(applicant.tags || []),
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((applicant, index) => ({ ...applicant, rank: index + 1 }));
  }, [applicants, selected]);

  const selectedCandidate = rankedApplicants.find((candidate) => candidate.id === selectedCandidateId) || null;

  /**
   * Linking a ranked candidate back to the application it came from.
   *
   * The server now stamps `applicationId` onto each candidate, matched by the
   * position the CV was posted in, so this is exact. The name lookup is only a
   * fallback for older saved runs: the parser reads the name out of the CV
   * text, which regularly differs from the name on the account, and that is
   * what used to leave rows saying "no application matched this CV" with the
   * fair score never reaching the applicants table.
   */
  const applicantsById = useMemo(() => {
    const byApplicationId = new Map();
    const byName = new Map();
    for (const applicant of rankedApplicants) {
      byApplicationId.set(applicant.applicationId, applicant);
      byName.set((applicant.name || "").trim().toLowerCase(), applicant);
    }
    return { byApplicationId, byName };
  }, [rankedApplicants]);

  const matchApplicant = (candidate) =>
    (candidate?.applicationId && applicantsById.byApplicationId.get(candidate.applicationId)) ||
    applicantsById.byName.get((candidate?.name || "").trim().toLowerCase()) ||
    null;

  /**
   * A posting is closed either because its deadline passed or because an admin
   * stopped it. Both need to read the same on this screen and on the
   * applicant's, so `status` is part of the test, not just the date.
   */
  const jobState = (job) => {
    const deadlinePassed = deadlineUTC(job.deadline) < now;
    const stopped = job.status && job.status !== "open";
    return { deadlinePassed, stopped, isClosed: deadlinePassed || stopped };
  };

  const statusPill = (job) => {
    const { deadlinePassed, stopped } = jobState(job);
    if (stopped) return { label: "Stopped", cls: "bg-amber-50 text-amber-700 border-amber-200", icon: Ban };
    if (deadlinePassed) return { label: "Closed", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: XCircle };
    return { label: "Ongoing", cls: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: CheckCircle2 };
  };

  async function runJobAction(jobId, action) {
    setJobBusyId(jobId);
    setJobError("");
    setJobNotice("");
    try {
      const data = await action();
      await onJobsChanged?.();
      return data;
    } catch (err) {
      setJobError(err.message || "That did not work.");
      return null;
    } finally {
      setJobBusyId(null);
    }
  }

  async function handleStopJob(job) {
    await runJobAction(job.id, () => api.jobs.stop(job.id));
    setJobNotice(`"${job.title}" is no longer accepting applications.`);
  }

  async function handleReopenJob(job) {
    await runJobAction(job.id, () => api.jobs.reopen(job.id));
    setJobNotice(`"${job.title}" is accepting applications again.`);
  }

  async function handleDeleteJob(job) {
    const data = await runJobAction(job.id, () => api.jobs.remove(job.id));
    // On failure the dialog stays open so the reason is read where it happened,
    // rather than closing and dropping an error behind it.
    if (!data) return;
    setConfirmDelete(null);
    setJobNotice(data.message || "Job posting deleted.");
    if (selectedJobId === job.id) {
      setSelectedJobId(null);
      setView("list");
    }
  }

  /**
   * Screen the CVs applicants ALREADY submitted for this job.
   *
   * The server pulls each stored CV out of GridFS and posts the exact same
   * multipart request to the module-1 ranking Space, so the response lands in
   * `rankingResult` in exactly the shape the panels below already render. It
   * also writes each candidate's fair score back onto their application.
   */
  async function handleScreenStoredCvs() {
    if (!selected) return;
    setStoredScreenLoading(true);
    setRankingError("");
    setRankingResult(null);
    setScreenTab("scoring");
    setSkillCandidateId(null);
    try {
      const data = await api.screening.runFromJob({ jobId: selected.id });
      if (data._jdSkills || data._candidateSkills) {
        skillsPreloaded.current = true;
        setRankingSkills({ jdSkills: data._jdSkills, candidateSkills: data._candidateSkills || {} });
      }
      setScreenedJob({ title: selected.title, description: selected.description || selected.summary || "" });
      setRankingResult(data);
      // The report gets its own screen rather than growing this one.
      setView("screening");
      await loadApplicants(selected.id);
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    } catch (error) {
      setRankingError(error.message || "Could not screen the stored CVs for this job.");
    } finally {
      setStoredScreenLoading(false);
    }
  }

  /**
   * Saves the decision and tells the applicant.
   *
   * The server writes the new status onto the application, appends it to the
   * status history, and creates a notification addressed to that applicant —
   * so "shortlisted" or "rejected" shows up in their portal without anyone
   * sending an email by hand.
   */
  async function handleSetStatus(applicationId, status) {
    setStatusBusy(applicationId);
    setApplicantsError("");
    try {
      const data = await api.applications.setStatus(applicationId, status);
      await loadApplicants(selectedJobId);
      onJobsChanged?.();
      const name = data?.application?.applicantName || "The applicant";
      setStatusNotice(`${name} was marked ${status.replace(/_/g, " ")} and has been notified.`);
    } catch (error) {
      setApplicantsError(error.message || "Could not update this application.");
    } finally {
      setStatusBusy(null);
    }
  }

  /** Runs module-1 GLiNER extraction on a CV that was stored without it. */
  async function handleReextract(applicationId) {
    setStatusBusy(applicationId);
    try {
      await api.applications.reextract(applicationId);
      await loadApplicants(selectedJobId);
    } catch (error) {
      setApplicantsError(error.message || "Skill extraction failed.");
    } finally {
      setStatusBusy(null);
    }
  }

  const STATUS_STYLE = {
    submitted: "border-slate-200 bg-slate-100 text-slate-600",
    under_review: "border-sky-200 bg-sky-50 text-sky-700",
    shortlisted: "border-emerald-200 bg-emerald-50 text-emerald-700",
    interview: "border-indigo-200 bg-indigo-50 text-indigo-700",
    offered: "border-violet-200 bg-violet-50 text-violet-700",
    hired: "border-emerald-300 bg-emerald-100 text-emerald-800",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
    withdrawn: "border-slate-200 bg-slate-100 text-slate-500",
  };

  // ── Post-a-job entry point (used to be the "+ New" button in the header) ──
  const PostJobPanel = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 via-sky-500 to-cyan-400 text-white shadow-lg shadow-indigo-200/70">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-slate-900">Post a job opening</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Upload or paste a job description. Required skills are extracted from it.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNewJob?.()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New job posting
        </button>
      </div>
    </div>
  );

  const JobList = () => (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Latest Job Posts</div>
        <Pill className="border border-slate-200 bg-slate-100 text-slate-700">{filteredJobs.length} job posts</Pill>
      </div>

      {jobNotice && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <div className="flex-1 text-xs text-emerald-800">{jobNotice}</div>
          <button onClick={() => setJobNotice("")} className="text-xs font-semibold text-emerald-700">
            Dismiss
          </button>
        </div>
      )}
      {jobError && (
        <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{jobError}</div>
      )}

      <div className="mt-3">
        <PagedList
          items={filteredJobs}
          resetKey={`${search}:${filteredJobs.length}`}
          row={(job) => {
            const status = statusPill(job);
            const Icon = status.icon;
            const { stopped, deadlinePassed } = jobState(job);
            const busy = jobBusyId === job.id;

            return (
              <div
                key={job.id}
                className="rounded-2xl border border-slate-200 bg-white transition hover:border-indigo-200 hover:shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setSelectedCandidateId(null);
                    setView("job");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="w-full p-3 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-10 w-1.5 rounded-full bg-slate-200" />
                      <div>
                        <div className="font-semibold text-slate-900">{job.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {job.dept} / {job.location}
                        </div>
                      </div>
                    </div>
                    <Pill className={cx("border shrink-0", status.cls)}>
                      <Icon className="mr-1 h-3.5 w-3.5" /> {status.label}
                    </Pill>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                      Deadline: {job.deadline}
                    </Pill>
                    <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                      Applicants: {getApplicantCount(job.id)}
                    </Pill>
                  </div>
                </button>

                {/* Admin controls, kept outside the row button so a click here
                    never opens the posting by accident. */}
                <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 px-3 py-2">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <>
                      {stopped ? (
                        <button
                          type="button"
                          onClick={() => handleReopenJob(job)}
                          disabled={deadlinePassed}
                          title={
                            deadlinePassed
                              ? "The deadline has passed — extend it before reopening."
                              : "Start accepting applications again"
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" />
                          Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStopJob(job)}
                          disabled={deadlinePassed}
                          title={
                            deadlinePassed
                              ? "This posting already closed on its deadline."
                              : "Stop accepting applications. Applicants will see it as closed."
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Ban className="h-3 w-3" />
                          Stop posting
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setJobError("");
                          setConfirmDelete(job);
                        }}
                        title="Delete this job posting"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Fair-screening results — everything below renders from ONE module-1 run
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * Skill analysis tab: the JD's required skills first, then a candidate
   * picker. Picking someone splits their extracted skills three ways against
   * the JD — matched, missing, and extra.
   */
  const renderSkillAnalysis = () => {
    const candidates = rankingResult?.candidates || [];

    if (skillsLoading && !rankingSkills) {
      return (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-10 text-sm text-slate-500 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
          Reading skills out of the job description and the CVs…
        </div>
      );
    }
    if (!rankingSkills) {
      return (
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          No skill data came back. Check the skill extractor API connection and run the screening again.
        </div>
      );
    }

    const jdItems = flattenSkillItems(rankingSkills.jdSkills);
    const jdSections = getSkillSections(rankingSkills.jdSkills);

    const splitFor = (candidate) => {
      const cvItems = flattenSkillItems(rankingSkills.candidateSkills?.[candidate.id]);
      const matched = cvItems.filter((cs) => jdItems.some((js) => isSkillMatch(cs.name, js.name)));
      const missing = jdItems.filter((js) => !cvItems.some((cs) => isSkillMatch(cs.name, js.name)));
      const extra = cvItems.filter((cs) => !jdItems.some((js) => isSkillMatch(cs.name, js.name)));
      return { cvItems, matched, missing, extra };
    };

    const active =
      candidates.find((c) => c.id === skillCandidateId) ||
      candidates.slice().sort((a, b) => (a.step2_fair?.rank ?? 99) - (b.step2_fair?.rank ?? 99))[0] ||
      null;
    const activeSplit = active ? splitFor(active) : null;

    const SkillChip = ({ item, tone }) => (
      <span
        className={cx(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
          tone === "matched"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : tone === "missing"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
        )}
      >
        <span>{item.name}</span>
        {typeof item.score === "number" && (
          <span className="font-mono opacity-70">{Math.round(item.score * 100)}%</span>
        )}
      </span>
    );

    return (
      <div className="space-y-4">
        {/* What the job asks for */}
        <Section
          title="Skills this job needs"
          caption={`${jdItems.length} skill${jdItems.length === 1 ? "" : "s"} read out of the job description.`}
        >
          {jdSections.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-500">
              The extractor found no skills in this job description.
            </div>
          ) : (
            <div className="space-y-2.5">
              {jdSections.map((section) => (
                <div key={section.category} className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {section.label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {section.items.map((item) => (
                      <span
                        key={item.name}
                        className={cx(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
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
        </Section>

        {/* Pick a candidate */}
        <Section title="Candidates" caption="Pick someone to see how their skills line up against the list above.">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {candidates
              .slice()
              .sort((a, b) => (a.step2_fair?.rank ?? 99) - (b.step2_fair?.rank ?? 99))
              .map((candidate) => {
                const { matched } = splitFor(candidate);
                const coverage = jdItems.length ? Math.round((matched.length / jdItems.length) * 100) : 0;
                const isActive = active?.id === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setSkillCandidateId(candidate.id)}
                    className={cx(
                      "rounded-2xl border p-3 text-left transition",
                      isActive
                        ? "border-indigo-300 bg-indigo-50/80 ring-2 ring-indigo-200"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{candidate.name}</span>
                      <span className="shrink-0 text-xs font-mono text-slate-400">#{candidate.step2_fair?.rank}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                          style={{ width: `${coverage}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-600">
                        {matched.length}/{jdItems.length} skills
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>
        </Section>

        {/* The three-way split */}
        {active && activeSplit && (
          <Section
            title={`${active.name} — skill breakdown`}
            caption={`${activeSplit.cvItems.length} skill${activeSplit.cvItems.length === 1 ? "" : "s"} read out of this CV.`}
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-emerald-800">Matched</span>
                  <span className="font-mono text-sm font-bold text-emerald-700">{activeSplit.matched.length}</span>
                </div>
                <p className="mt-1 text-xs text-emerald-700/80">The job asks for these and the CV has them.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeSplit.matched.length === 0 ? (
                    <span className="text-xs text-slate-500">Nothing on the CV matched the job's list.</span>
                  ) : (
                    activeSplit.matched.map((item) => <SkillChip key={item.name} item={item} tone="matched" />)
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-rose-800">Missing</span>
                  <span className="font-mono text-sm font-bold text-rose-700">{activeSplit.missing.length}</span>
                </div>
                <p className="mt-1 text-xs text-rose-700/80">The job asks for these and the CV does not have them.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeSplit.missing.length === 0 ? (
                    <span className="text-xs text-slate-500">Nothing missing. The CV covers the whole list.</span>
                  ) : (
                    activeSplit.missing.map((item) => <SkillChip key={item.name} item={item} tone="missing" />)
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-slate-800">Extra</span>
                  <span className="font-mono text-sm font-bold text-slate-600">{activeSplit.extra.length}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">On the CV, but the job did not ask for them.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeSplit.extra.length === 0 ? (
                    <span className="text-xs text-slate-500">Nothing beyond what the job asked for.</span>
                  ) : (
                    activeSplit.extra.map((item) => <SkillChip key={item.name} item={item} tone="extra" />)
                  )}
                </div>
              </div>
            </div>
          </Section>
        )}
      </div>
    );
  };

  const renderScreeningResults = () => {
    const candidates = rankingResult?.candidates || [];
    if (!candidates.length) return null;

    // Every paged section collapses back to page one when a new run arrives.
    const runId = rankingResult?._runId || rankingResult?.metadata?.inference_timestamp || candidates.length;
    const shortlistAt = rankingResult?.metadata?.match_threshold ?? VERDICT_BANDS.shortlist;
    const summary = rankingResult?.fairness_summary || {};
    const before = summary.before_debiasing || {};
    const after = summary.after_debiasing || {};
    const improvement = summary.improvement || {};
    const perAttribute = rankingResult?.per_attribute_bias || {};

    const byBiasedRank = candidates.slice().sort((a, b) => (a.step1_biased?.rank ?? 99) - (b.step1_biased?.rank ?? 99));
    const byFairRank = candidates.slice().sort((a, b) => (a.step2_fair?.rank ?? 99) - (b.step2_fair?.rank ?? 99));
    // Biggest gain from debiasing first, biggest correction last.
    const byRankMovement = candidates
      .slice()
      .sort((a, b) => (b.bias_analysis?.rank_change ?? 0) - (a.bias_analysis?.rank_change ?? 0));

    const maxFair = Math.max(...candidates.map((c) => c.step2_fair?.fair_similarity ?? 0), 0.0001);

    /** Plain-English read of what debiasing did to one candidate's position. */
    const rankComment = (candidate) => {
      const move = candidate.bias_analysis?.rank_change ?? 0;
      const wasPrivileged = candidate.bias_analysis?.was_privileged;
      const wasDisadvantaged = candidate.bias_analysis?.was_disadvantaged;
      const penalty = candidate.step1_biased?.demographic_adjustments?.total ?? 0;
      const points = Math.abs(penalty).toFixed(3);

      if (move > 0) {
        return wasDisadvantaged
          ? `Up ${move}. The first model was taking ${points} points off for background. Without that, the CV ranks higher.`
          : `Up ${move}. The candidates above were being carried by background points, not by their CVs.`;
      }
      if (move < 0) {
        const drop = Math.abs(move);
        return wasPrivileged
          ? `Down ${drop}. The first model was adding ${points} points for background. On the CV alone the rank is lower.`
          : `Down ${drop}. Candidates who had been losing points moved past.`;
      }
      if (wasPrivileged) return "No change. The extra points did not affect who was ahead.";
      if (wasDisadvantaged) return "No change. The lost points were not enough to overtake anyone.";
      return "No change. Background was not deciding this position.";
    };

    return (
      <div ref={resultsRef} className="space-y-4">
        {/* Run header */}
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight text-slate-900">
                  Fair screening — {screenedJob.title || rankingResult?.metadata?.job_title || "this role"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {candidates.length} stored CV{candidates.length > 1 ? "s" : ""}, scored twice: once by the initial
                  model, once after debiasing.
                </div>
              </div>
            </div>
            <Pill className="border border-slate-200 bg-white text-slate-600">
              Shortlisting bar: {(shortlistAt * 100).toFixed(0)}%
            </Pill>
          </div>
        </div>

        {/* Two views over the same run */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-1.5">
          {[
            { key: "scoring", label: "Candidate scoring details" },
            { key: "skills", label: "Skill analysis" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScreenTab(tab.key)}
              className={cx(
                "flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition",
                screenTab === tab.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {screenTab === "scoring" && (<>

        {/* 1 ── Parsed candidate profiles ─────────────────────────────────── */}
        <Section
          step={1}
          title="Parsed candidate profiles"
          caption="What the parser read off each CV. These are the four things the debiased model is told to ignore."
        >
          <ScrollTable>
            <thead className="bg-slate-50">
              <tr>
                <TH>Candidate</TH>
                <TH>University</TH>
                <TH>Gender</TH>
                <TH>Ethnicity</TH>
                <TH>Skin colour</TH>
              </tr>
            </thead>
            <PagedBody
              columns={5}
              resetKey={runId}
              items={byFairRank}
              row={(candidate) => (
                <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-3 font-semibold text-slate-900">{candidate.name}</td>
                  <td className="px-3 py-3 text-slate-700">{candidate.demographics?.university || "Not specified"}</td>
                  <td className="px-3 py-3 text-slate-700">{candidate.demographics?.gender || "Not specified"}</td>
                  <td className="px-3 py-3 text-slate-700">{candidate.demographics?.ethnicity || "Not specified"}</td>
                  <td className="px-3 py-3 text-slate-700">{candidate.demographics?.skin_color || "Not specified"}</td>
                </tr>
              )}
            />
          </ScrollTable>
        </Section>

        {/* 2 ── Biased model similarity ───────────────────────────────────── */}
        <Section
          step={2}
          title="Similarity score from the initial (biased) model"
          caption="What our first model scored each CV against this job, before any debiasing."
        >
          <ScrollTable>
            <thead className="bg-slate-50">
              <tr>
                <TH>Candidate</TH>
                <TH align="right">Similarity score</TH>
                <TH align="center">Rank it gave</TH>
              </tr>
            </thead>
            <PagedBody
              columns={3}
              resetKey={runId}
              items={byBiasedRank}
              row={(candidate) => (
                <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{candidate.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{candidate.demographics?.university}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono font-semibold text-amber-700">
                    {formatScore(candidate.step1_biased?.final_biased_score)}
                  </td>
                  <td className="px-3 py-3 text-center font-semibold text-slate-700">
                    #{candidate.step1_biased?.rank}
                  </td>
                </tr>
              )}
            />
          </ScrollTable>
        </Section>

        {/* 3 ── Bias penalty or reward per candidate ──────────────────────── */}
        <Section
          step={3}
          title="Bias built into that score"
          caption="How many points each candidate gained or lost for their background alone. Plus means the model added points, minus means it took them away."
        >
          <ScrollTable>
            <thead className="bg-slate-50">
              <tr>
                <TH>Candidate</TH>
                {BIAS_FACTORS.map((f) => (
                  <TH key={f.key} align="right">{f.label}</TH>
                ))}
                <TH align="right">Total points from background</TH>
                <TH>Effect on this candidate</TH>
              </tr>
            </thead>
            <PagedBody
              columns={7}
              resetKey={runId}
              items={byBiasedRank}
              row={(candidate) => {
                const adj = candidate.step1_biased?.demographic_adjustments || {};
                const total = adj.total ?? 0;
                return (
                  <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-3 font-semibold text-slate-900">{candidate.name}</td>
                    {BIAS_FACTORS.map((f) => (
                      <td key={f.key} className={cx("px-3 py-3 text-right font-mono font-semibold", adjustmentClass(adj[f.key]))}>
                        {formatAdjustment(adj[f.key])}
                      </td>
                    ))}
                    <td className={cx("px-3 py-3 text-right font-mono font-bold", adjustmentClass(total))}>
                      {formatAdjustment(total)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cx(
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          total > 0.0005
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : total < -0.0005
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-100 text-slate-500"
                        )}
                      >
                        {total > 0.0005 ? "Given points" : total < -0.0005 ? "Lost points" : "Unaffected"}
                      </span>
                    </td>
                  </tr>
                );
              }}
            />
          </ScrollTable>
          <p className="mt-3 text-xs text-slate-500">
            The score in step 2 is the CV's own reading plus this total, capped to the 0–1 range.
          </p>
        </Section>

        {/* 4 ── The same table, after debiasing ───────────────────────────── */}
        <Section
          step={4}
          title="After removing bias"
          caption="The same four factors on the debiased model. The closer to 0.000, the less a candidate's background still moves their score."
        >
          <ScrollTable>
            <thead className="bg-slate-50">
              <tr>
                <TH>Candidate</TH>
                {BIAS_FACTORS.map((f) => (
                  <TH key={f.key} align="right">{f.label}</TH>
                ))}
                <TH align="right">Total still left</TH>
                <TH align="right">Was before</TH>
              </tr>
            </thead>
            <PagedBody
              columns={7}
              resetKey={runId}
              items={byFairRank}
              row={(candidate) => {
                const adj = candidate.step1_biased?.demographic_adjustments || {};
                const afterAdj = adj.after || {};
                return (
                  <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-3 font-semibold text-slate-900">{candidate.name}</td>
                    {BIAS_FACTORS.map((f) => (
                      <td key={f.key} className={cx("px-3 py-3 text-right font-mono font-semibold", adjustmentClass(afterAdj[f.key]))}>
                        {formatAdjustment(afterAdj[f.key])}
                      </td>
                    ))}
                    <td className={cx("px-3 py-3 text-right font-mono font-bold", adjustmentClass(afterAdj.total))}>
                      {formatAdjustment(afterAdj.total)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs text-slate-400 line-through">
                      {formatAdjustment(adj.total)}
                    </td>
                  </tr>
                );
              }}
            />
          </ScrollTable>
        </Section>

        {/* 5 ── Per-candidate breakdown, in plain words ───────────────────── */}
        <Section
          step={5}
          title="Factor by factor, per candidate"
          caption="The same numbers per person, with a line under each table saying what happened."
        >
          <PagedList
            className="space-y-3"
            resetKey={runId}
            items={byFairRank}
            row={(candidate) => {
              const adj = candidate.step1_biased?.demographic_adjustments || {};
              const afterAdj = adj.after || {};
              const removedPct = adj.after_removed_pct || {};
              const total = adj.total ?? 0;
              const totalAfter = afterAdj.total ?? 0;
              const totalRemoved = removedPct.total ?? 0;
              const rewarded = total > 0.0005;
              return (
                <div key={candidate.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{candidate.name}</span>
                    <span className="text-xs text-slate-500">
                      {candidate.demographics?.university} · {candidate.demographics?.gender} ·{" "}
                      {candidate.demographics?.ethnicity}
                    </span>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <TH>Background factor</TH>
                          <TH align="right">Points before debiasing</TH>
                          <TH align="right">Points after debiasing</TH>
                          <TH align="right">Share removed</TH>
                        </tr>
                      </thead>
                      <tbody>
                        {BIAS_FACTORS.map((f) => {
                          const b = adj[f.key] ?? 0;
                          const a = afterAdj[f.key] ?? 0;
                          const pct = removedPct[f.key] ?? 0;
                          return (
                            <tr key={f.key} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-700">{f.label}</td>
                              <td className={cx("px-3 py-2 text-right font-mono font-semibold", adjustmentClass(b))}>
                                {formatAdjustment(b)}
                              </td>
                              <td className={cx("px-3 py-2 text-right font-mono font-semibold", adjustmentClass(a))}>
                                {formatAdjustment(a)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                {pct >= 90 ? (
                                  <span className="font-semibold text-emerald-600">✓ {pct}%</span>
                                ) : (
                                  <span className="text-slate-500">{pct}%</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-slate-200 bg-slate-50">
                          <td className="px-3 py-2 font-semibold text-slate-900">
                            Total points {rewarded ? "gained" : "lost"}
                          </td>
                          <td className={cx("px-3 py-2 text-right font-mono font-bold", adjustmentClass(total))}>
                            {formatAdjustment(total)}
                          </td>
                          <td className={cx("px-3 py-2 text-right font-mono font-bold", adjustmentClass(totalAfter))}>
                            {formatAdjustment(totalAfter)}
                          </td>
                          <td className={cx("px-3 py-2 text-right font-semibold", totalRemoved >= 60 ? "text-emerald-700" : "text-slate-500")}>
                            {totalRemoved}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2.5 text-xs leading-5 text-slate-600">
                    {Math.abs(total) < 0.0005 ? (
                      <>{candidate.name}'s background did not move their score either way.</>
                    ) : (
                      <>
                        The first model {rewarded ? "added" : "took off"} {Math.abs(total).toFixed(3)} points for{" "}
                        {candidate.name}'s background alone. After debiasing that is down to{" "}
                        {Math.abs(totalAfter).toFixed(3)}, so {totalRemoved}% of it is gone.
                      </>
                    )}
                  </p>
                </div>
              );
            }}
          />
        </Section>

        {/* 5.2 ── Total bias removed per candidate ────────────────────────── */}
        <Section
          /* No step badge here — it reads as a continuation of step 5, not a
             separate stage of the pipeline. */
          title="Total bias removed, per candidate"
          caption="How many points of background effect the debiased model stripped out for each person."
        >
          <ScrollTable>
            <thead className="bg-slate-50">
              <tr>
                <TH>Candidate</TH>
                <TH align="right">Points before debiasing</TH>
                <TH align="right">Points after debiasing</TH>
                <TH align="right">Points removed</TH>
                <TH>Share removed</TH>
              </tr>
            </thead>
            <PagedBody
              columns={5}
              resetKey={runId}
              items={byFairRank}
              row={(candidate) => {
                const adj = candidate.step1_biased?.demographic_adjustments || {};
                const total = Math.abs(adj.total ?? 0);
                const left = Math.abs(adj.after?.total ?? 0);
                const erased = Math.max(0, total - left);
                const pct = adj.after_removed_pct?.total ?? 0;
                return (
                  <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-3 font-semibold text-slate-900">{candidate.name}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-800">{total.toFixed(3)}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-500">{left.toFixed(3)}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">{erased.toFixed(3)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right font-mono text-xs font-semibold text-emerald-700">
                          {pct}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
          </ScrollTable>
        </Section>

        {/* 6 ── Fair score, ranked ────────────────────────────────────────── */}
        <Section
          step={6}
          title="Score after debiasing, ranked"
          caption="How the debiased model scores each CV against this job, best first."
        >
          <ScrollTable>
            <thead className="bg-slate-50">
              <tr>
                <TH align="center">Rank</TH>
                <TH>Candidate</TH>
                <TH align="right">Score after debiasing</TH>
                <TH>Compared to the top score</TH>
              </tr>
            </thead>
            <PagedBody
              columns={4}
              resetKey={runId}
              items={byFairRank}
              row={(candidate) => {
                const fair = candidate.step2_fair?.fair_similarity ?? 0;
                return (
                  <tr key={candidate.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {candidate.step2_fair?.rank}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{candidate.name}</div>
                      <div className="mt-0.5 text-xs text-slate-400">{candidate.demographics?.university}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-emerald-700">{formatScore(fair)}</td>
                    <td className="px-3 py-3">
                      <div className="h-2 w-full min-w-[100px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500"
                          style={{ width: `${Math.min((fair / maxFair) * 100, 100)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              }}
            />
          </ScrollTable>
        </Section>

        {/* 7 ── Before / after chart ──────────────────────────────────────── */}
        <Section
          step={7}
          title="Before and after, side by side"
          caption="Each candidate's score under both models."
        >
          <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500" />
              Initial model
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500" />
              After debiasing
            </span>
          </div>
          <PagedList
            className="space-y-4"
            resetKey={runId}
            items={byFairRank}
            row={(candidate) => {
              const biasedScore = candidate.step1_biased?.final_biased_score ?? 0;
              const fairScore = candidate.step2_fair?.fair_similarity ?? 0;
              const delta = fairScore - biasedScore;
              return (
                <div key={candidate.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-3">
                  <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900">{candidate.name}</span>
                    <span
                      className={cx(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        delta > 0.0005
                          ? "bg-emerald-50 text-emerald-700"
                          : delta < -0.0005
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {delta > 0.0005 ? "went up" : delta < -0.0005 ? "came down" : "unchanged"}{" "}
                      {formatAdjustment(delta, 4)}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      #{candidate.step1_biased?.rank} → #{candidate.step2_fair?.rank}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-right text-[11px] font-medium text-slate-400">Initial</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-700"
                          style={{ width: `${Math.min(biasedScore * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold text-amber-700">
                        {biasedScore.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 shrink-0 text-right text-[11px] font-medium text-slate-400">Debiased</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700"
                          style={{ width: `${Math.min(fairScore * 100, 100)}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right font-mono text-xs font-semibold text-emerald-700">
                        {fairScore.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </Section>

        {/* 8 ── Fairness impact, explained ────────────────────────────────── */}
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white shadow-sm">
          <div className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-xl">
                <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Step 8 · Fairness impact
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-5xl font-bold tabular-nums text-emerald-400">
                    {improvement.spread_reduction_pct ?? 0}%
                  </span>
                  <span className="text-sm font-medium text-slate-300">of the score gap closed</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  The score gap is the distance between the top and bottom score in this batch. It was{" "}
                  <span className="font-mono font-semibold text-white">{formatScore(before.score_spread)}</span>, and
                  part of that came from university, gender, skin colour and ethnicity rather than the CVs. After
                  debiasing it is{" "}
                  <span className="font-mono font-semibold text-emerald-400">{formatScore(after.score_spread)}</span>.
                  So {improvement.spread_reduction_pct ?? 0}% of the gap was background, not skills.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Gained the most</div>
                  <div className="mt-1 text-sm font-semibold text-white">{improvement.most_improved || "—"}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">was losing the most points</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Came down the most</div>
                  <div className="mt-1 text-sm font-semibold text-white">{improvement.most_corrected || "—"}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">was gaining the most points</div>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Over the bar before</div>
                  <div className="mt-1 text-xl font-bold text-white">
                    {before.shortlisted_count ?? 0}
                    <span className="ml-1 text-sm font-normal text-slate-300">/ {summary.total_candidates ?? candidates.length}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 px-4 py-3">
                  <div className="text-[11px] font-medium text-slate-400">Over the bar after</div>
                  <div className="mt-1 text-xl font-bold text-emerald-400">
                    {after.shortlisted_count ?? 0}
                    <span className="ml-1 text-sm font-normal text-slate-300">/ {summary.total_candidates ?? candidates.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Before / after statistics, each with what it means */}
            <div className="mt-6 overflow-x-auto rounded-2xl bg-white/5 ring-1 ring-inset ring-white/10">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5">Measure</th>
                    <th className="px-4 py-2.5 text-right">Initial model</th>
                    <th className="px-4 py-2.5 text-right">After debiasing</th>
                    <th className="px-4 py-2.5">What this measure means</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {[
                    {
                      label: "Score gap (top minus bottom)",
                      before: before.score_spread,
                      after: after.score_spread,
                      note: "How far apart the batch is.",
                    },
                    {
                      label: "Average score",
                      before: before.mean_score,
                      after: after.mean_score,
                      note: "The middle of the batch. It rises when penalties come off.",
                    },
                    {
                      label: "Spread around the average",
                      before: before.std_score,
                      after: after.std_score,
                      note: "How tightly the scores cluster. Smaller means less separates candidates.",
                    },
                    {
                      label: "Highest score",
                      before: before.max_score,
                      after: after.max_score,
                      note: "The top of the batch.",
                    },
                    {
                      label: "Lowest score",
                      before: before.min_score,
                      after: after.min_score,
                      note: "The bottom of the batch.",
                    },
                  ].map((row) => (
                    <tr key={row.label} className="border-t border-white/10">
                      <td className="px-4 py-2.5 font-medium text-white">{row.label}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-amber-300">{formatScore(row.before)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400">
                        {formatScore(row.after)}
                      </td>
                      <td className="px-4 py-2.5 text-xs leading-5 text-slate-400">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Which attribute was doing the damage */}
            {Object.keys(perAttribute).length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-2xl bg-white/5 ring-1 ring-inset ring-white/10">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-2.5">Background factor</th>
                      <th className="px-4 py-2.5 text-right">Most points it added</th>
                      <th className="px-4 py-2.5 text-right">Most points it took</th>
                      <th className="px-4 py-2.5 text-right">Points it could swing</th>
                      <th className="px-4 py-2.5 text-right">Points it swings now</th>
                      <th className="px-4 py-2.5">Does it still decide anything?</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {BIAS_FACTORS.filter((f) => perAttribute[f.key]).map((f) => {
                      const stats = perAttribute[f.key];
                      const settled = (stats.fair_score_group_spread ?? 0) < 0.01;
                      return (
                        <tr key={f.key} className="border-t border-white/10">
                          <td className="px-4 py-2.5 font-medium text-white">{f.label}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-amber-300">
                            {formatAdjustment(stats.max_bonus)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-rose-300">
                            {formatAdjustment(stats.max_penalty)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                            {(stats.adjustment_range ?? 0).toFixed(3)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-emerald-400">
                            {(stats.fair_score_group_spread ?? 0).toFixed(4)}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            <span
                              className={cx(
                                "rounded-full px-2 py-0.5 font-semibold",
                                settled ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"
                              )}
                            >
                              {settled ? "No" : "Yes, still does"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* 9 ── Rank movement with a comment ──────────────────────────────── */}
        <Section
          step={9}
          title="Rank before vs. rank after"
          caption="Sorted by how far debiasing moved each candidate. Biggest gains first."
        >
          <PagedList
            className="space-y-2"
            resetKey={runId}
            items={byRankMovement}
            row={(candidate) => {
                const move = candidate.bias_analysis?.rank_change ?? 0;
                const Icon = move > 0 ? ArrowUp : move < 0 ? ArrowDown : Minus;
                return (
                  <div
                    key={candidate.id}
                    className={cx(
                      "flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:items-center sm:gap-4",
                      move > 0
                        ? "border-emerald-200 bg-emerald-50/40"
                        : move < 0
                          ? "border-amber-200 bg-amber-50/40"
                          : "border-slate-200 bg-slate-50"
                    )}
                  >
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex items-center gap-1.5 font-mono text-sm">
                        <span className="text-slate-400">#{candidate.step1_biased?.rank}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                        <span className="font-bold text-slate-900">#{candidate.step2_fair?.rank}</span>
                      </div>
                      <span
                        className={cx(
                          "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                          move > 0
                            ? "border-emerald-200 bg-white text-emerald-700"
                            : move < 0
                              ? "border-amber-200 bg-white text-amber-700"
                              : "border-slate-200 bg-white text-slate-500"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {move === 0 ? "same" : Math.abs(move)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{candidate.name}</div>
                      <div className="mt-0.5 text-xs leading-5 text-slate-600">{rankComment(candidate)}</div>
                    </div>
                  </div>
                );
              }}
          />
        </Section>

        {/* 10 ── Final decision ───────────────────────────────────────────── */}
        <Section
          step={10}
          title="Final ranking and AI verdict"
          caption={`Scored by the debiased model. ${(VERDICT_BANDS.high * 100).toFixed(0)}%+ highly probable, ${(shortlistAt * 100).toFixed(0)}%+ shortlisted, ${(VERDICT_BANDS.weak * 100).toFixed(0)}%+ weak match, below that rejected. Shortlist and reject save to the application and notify the applicant.`}
        >
          {statusNotice && (
            <div className="mb-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div className="flex-1 text-xs text-emerald-800">{statusNotice}</div>
              <button onClick={() => setStatusNotice("")} className="text-xs font-semibold text-emerald-700">
                Dismiss
              </button>
            </div>
          )}
          <PagedList
            className="space-y-3"
            resetKey={runId}
            items={byFairRank}
            row={(candidate) => {
              const fair = candidate.step2_fair?.fair_similarity;
              const verdict = aiVerdict(fair, shortlistAt);
              const applicant = matchApplicant(candidate);
              const busy = applicant && statusBusy === applicant.applicationId;
              return (
                <div
                  key={candidate.id}
                  className={cx(
                    "relative overflow-hidden rounded-2xl border p-4",
                    applicant?.tone === "positive"
                      ? "border-emerald-200 bg-emerald-50/40"
                      : applicant?.tone === "negative"
                        ? "border-rose-200 bg-rose-50/40"
                        : applicant?.tone === "mixed"
                          ? "border-amber-200 bg-amber-50/40"
                          : "border-slate-200 bg-white"
                  )}
                >
                  {/* Tone stripe: green = returning, red = rejected before */}
                  <span className={cx("absolute left-0 top-0 h-full w-1", TONE_BAR_CLASS[applicant?.tone] || "bg-transparent")} />

                  <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                        {candidate.step2_fair?.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{candidate.name}</span>
                          <span className={cx("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", verdict.cls)}>
                            {verdict.label}
                          </span>
                          {applicant?.tags?.length ? <ApplicantTags tags={applicant.tags} size="xs" /> : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{verdict.note}</div>

                        {/* Item 11 — the previous-employee highlight, kept intact */}
                        {applicant?.isFormerEmployee && (
                          <div className="mt-2 inline-block rounded-xl border border-emerald-200 bg-white px-3 py-1.5 text-[11px] text-emerald-800">
                            <span className="font-semibold">Worked here before</span>
                            {applicant.formerRole ? ` as ${applicant.formerRole}` : ""}
                            {applicant.formerDepartment ? ` in ${applicant.formerDepartment}` : ""}
                            {applicant.formerTenureYears != null ? ` · ${applicant.formerTenureYears} years tenure` : ""}
                          </div>
                        )}

                        {/* Item 12 — the applied-before-and-rejected history, kept intact */}
                        {applicant?.wasPreviouslyRejected && (
                          <div className="mt-2 inline-block rounded-xl border border-rose-200 bg-white px-3 py-1.5 text-[11px] text-rose-800">
                            <span className="font-semibold">Rejected {applicant.previousRejectionCount}×</span> before
                            and has applied again.
                          </div>
                        )}
                        {applicant ? <LastAppliedNote application={applicant} /> : null}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="font-mono text-lg font-bold text-emerald-700">{formatScore(fair)}</div>
                        <div className="text-[11px] text-slate-400">
                          initial model: {formatScore(candidate.step1_biased?.final_biased_score)} (#
                          {candidate.step1_biased?.rank})
                        </div>
                      </div>

                      {applicant ? (
                        <>
                          {/* Where the decision stands right now. Set from
                              here, or from the applicants table, or by the
                              applicant withdrawing — this reads the saved
                              status either way. */}
                          <span
                            className={cx(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold capitalize",
                              STATUS_STYLE[applicant.status] || STATUS_STYLE.submitted
                            )}
                          >
                            {applicant.status === "shortlisted" && <ThumbsUp className="h-3 w-3" />}
                            {applicant.status === "rejected" && <ThumbsDown className="h-3 w-3" />}
                            {applicant.status.replace(/_/g, " ")}
                          </span>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSetStatus(applicant.applicationId, "shortlisted")}
                              disabled={busy || applicant.status === "shortlisted"}
                              title="Save as shortlisted and notify the applicant"
                              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                              {applicant.status === "shortlisted" ? "Shortlisted" : "Shortlist"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetStatus(applicant.applicationId, "rejected")}
                              disabled={busy || applicant.status === "rejected"}
                              title="Save as rejected and notify the applicant"
                              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                              {applicant.status === "rejected" ? "Rejected" : "Reject"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500">
                          No application matched this CV
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            }}
          />
        </Section>

        </>)}

        {screenTab === "skills" && renderSkillAnalysis()}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Screen 1: the job postings ────────────────────────────────── */}
      {view === "list" && (
        <>
          <PostJobPanel />
          <JobList />
        </>
      )}

      {/* ── Screen 2: one posting, its applicants underneath ──────────── */}
      {view === "job" && selected && (
        <div className="space-y-4">
          {/* Back out to the list, plus the controls for this posting */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setSelectedJobId(null);
                setSelectedCandidateId(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              All job posts
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {jobBusyId === selected.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : jobState(selected).stopped ? (
                <button
                  type="button"
                  onClick={() => handleReopenJob(selected)}
                  disabled={jobState(selected).deadlinePassed}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  Reopen posting
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStopJob(selected)}
                  disabled={jobState(selected).deadlinePassed}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" />
                  Stop posting
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setJobError("");
                  setConfirmDelete(selected);
                }}
                className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </div>

          {jobNotice && (
            <div className="flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div className="flex-1 text-xs text-emerald-800">{jobNotice}</div>
              <button onClick={() => setJobNotice("")} className="text-xs font-semibold text-emerald-700">
                Dismiss
              </button>
            </div>
          )}
          {jobError && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{jobError}</div>
          )}


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
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Applicants</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadApplicants(selectedJobId)}
                  disabled={applicantsLoading}
                  className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                  title="Reload applicants"
                >
                  <RefreshCw className={cx("h-3.5 w-3.5", applicantsLoading && "animate-spin")} />
                </button>
                <Pill className="border border-slate-200 bg-slate-100 text-slate-700">
                  {rankedApplicants.length} applicants
                </Pill>
              </div>
            </div>

            {rankedApplicants.length > 0 && (
              <button
                type="button"
                onClick={handleScreenStoredCvs}
                disabled={storedScreenLoading}
                title="Send every stored CV for this job to the fair-ranking model"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-3 py-2 text-xs font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {storedScreenLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Screening {rankedApplicants.length} stored CVs…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Fair-screen these {rankedApplicants.length} applicants
                  </>
                )}
              </button>
            )}

            {applicantsError && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                {applicantsError}
              </div>
            )}

            {applicantsLoading && rankedApplicants.length === 0 ? (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading applicants…
              </div>
            ) : rankedApplicants.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No applicants yet for this job.
              </div>
            ) : (
              // Job details sit above; the applicants read across from here —
              // the ranking on the left, whoever is selected on the right.
              <div className="mt-3 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-slate-600">
                        <th className="w-14 px-3 py-2 font-semibold">Rank</th>
                        <th className="px-3 py-2 font-semibold">Candidate Name</th>
                        <th className="w-40 px-3 py-2 font-semibold">Candidate Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankedApplicants.map((candidate) => {
                        const isActive = candidate.id === selectedCandidateId;
                        return (
                          <tr
                            key={candidate.id}
                            className={cx(
                              "relative cursor-pointer border-t border-slate-200 transition",
                              isActive ? "bg-indigo-50" : TONE_ROW_CLASS[candidate.tone] || "hover:bg-slate-50"
                            )}
                            onClick={() => setSelectedCandidateId(candidate.id)}
                          >
                            <td className="relative px-3 py-2 font-mono text-slate-700">
                              {/* Tone stripe: green = returning, red = rejected before */}
                              <span
                                className={cx(
                                  "absolute left-0 top-0 h-full w-1",
                                  TONE_BAR_CLASS[candidate.tone] || "bg-transparent"
                                )}
                              />
                              {candidate.rank}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 font-bold text-white">
                                  {candidate.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join("")}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">{candidate.name}</div>
                                  {candidate.tags?.length ? (
                                    <ApplicantTags tags={candidate.tags} size="xs" className="mt-1" />
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className={cx(
                                      "h-full rounded-full transition-all duration-500",
                                      candidate.scoreSource && candidate.scoreSource !== "heuristic"
                                        ? "bg-emerald-600"
                                        : "bg-indigo-600"
                                    )}
                                    style={{ width: `${Math.round(candidate.score * 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-slate-700">{(candidate.score * 100).toFixed(0)}%</span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                                {candidate.scoreSource && candidate.scoreSource !== "heuristic" ? (
                                  <>
                                    <span className="font-semibold text-emerald-600">fair model</span>
                                    {candidate.fairRank ? <span>· rank #{candidate.fairRank}</span> : null}
                                    {candidate.verdict ? <span>· {candidate.verdict.toLowerCase()}</span> : null}
                                  </>
                                ) : (
                                  "skill match · run fair screening for the real score"
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div
                  className={cx(
                    "rounded-2xl border p-4",
                    selectedCandidate?.tone === "positive"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : selectedCandidate?.tone === "negative"
                        ? "border-rose-200 bg-rose-50/50"
                        : selectedCandidate?.tone === "mixed"
                          ? "border-amber-200 bg-amber-50/50"
                          : "border-slate-200 bg-slate-50"
                  )}
                >
                  {!selectedCandidate ? null : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-bold text-slate-900">{selectedCandidate.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{selectedCandidate.email}</span>
                          </div>
                        </div>
                        <Pill className="shrink-0 border border-indigo-200 bg-indigo-50 text-indigo-700">
                          Score: {(selectedCandidate.score * 100).toFixed(0)}%
                        </Pill>
                      </div>

                      {/* POSITIVE / NEGATIVE re-application tags */}
                      {selectedCandidate.tags?.length ? (
                        <ApplicantTags tags={selectedCandidate.tags} className="mt-3" />
                      ) : null}

                      {selectedCandidate.isFormerEmployee && (
                        <div className="mt-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800">
                          <span className="font-semibold">Worked here before</span>
                          {selectedCandidate.formerRole ? ` as ${selectedCandidate.formerRole}` : ""}
                          {selectedCandidate.formerDepartment ? ` in ${selectedCandidate.formerDepartment}` : ""}
                          {selectedCandidate.formerTenureYears != null
                            ? ` · ${selectedCandidate.formerTenureYears} years tenure`
                            : ""}
                          {selectedCandidate.formerExitDate
                            ? ` · left ${new Date(selectedCandidate.formerExitDate).toLocaleDateString(undefined, { dateStyle: "medium" })}`
                            : ""}
                        </div>
                      )}

                      {selectedCandidate.wasPreviouslyRejected && (
                        <div className="mt-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs text-rose-800">
                          <span className="font-semibold">
                            Rejected {selectedCandidate.previousRejectionCount}×
                          </span>{" "}
                          before and has applied again.
                        </div>
                      )}

                      {/* "Admin can click his entry and see his last applied date" */}
                      <LastAppliedNote application={selectedCandidate} />

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Applied</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-800">
                            {new Date(selectedCandidate.appliedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Status</div>
                          <div className="mt-0.5">
                            <span
                              className={cx(
                                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize",
                                STATUS_STYLE[selectedCandidate.status] || STATUS_STYLE.submitted
                              )}
                            >
                              {selectedCandidate.status.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      </div>

                      {selectedCandidate.currentTitle || selectedCandidate.yearsExperience != null ? (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                          {selectedCandidate.currentTitle}
                          {selectedCandidate.yearsExperience != null
                            ? ` · ${selectedCandidate.yearsExperience} yrs experience`
                            : ""}
                          {selectedCandidate.location ? ` · ${selectedCandidate.location}` : ""}
                        </div>
                      ) : null}

                      {selectedCandidate.coverLetter ? (
                        <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400">Cover letter</div>
                          <div className="mt-1 text-xs leading-5 text-slate-600">{selectedCandidate.coverLetter}</div>
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-slate-700">Skills</div>
                          {selectedCandidate.extractionStatus === "done" ? (
                            <span className="text-[10px] font-semibold text-emerald-600">GLiNER extracted</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReextract(selectedCandidate.applicationId)}
                              disabled={statusBusy === selectedCandidate.applicationId}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                            >
                              {statusBusy === selectedCandidate.applicationId ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Sparkles className="h-3 w-3" />
                              )}
                              Extract skills
                            </button>
                          )}
                        </div>
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

                      <div className="mt-4 space-y-2">
                        <button
                          type="button"
                          onClick={() => setCvModal(selectedCandidate)}
                          disabled={!selectedCandidate.cvFileId}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Eye className="h-4 w-4" />
                          {selectedCandidate.cvFileId ? "View CV" : "No CV attached"}
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetStatus(selectedCandidate.applicationId, "shortlisted")}
                            disabled={statusBusy === selectedCandidate.applicationId || selectedCandidate.status === "shortlisted"}
                            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                            Shortlist
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetStatus(selectedCandidate.applicationId, "rejected")}
                            disabled={statusBusy === selectedCandidate.applicationId || selectedCandidate.status === "rejected"}
                            className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Screen 3: the fair-ranking report ─────────────────────────── */}
      {view === "screening" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <button
              type="button"
              onClick={() => {
                setView("job");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
              Back to {selected?.title || "the job"}
            </button>
            <button
              type="button"
              onClick={handleScreenStoredCvs}
              disabled={storedScreenLoading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={cx("h-3.5 w-3.5", storedScreenLoading && "animate-spin")} />
              Run again
            </button>
          </div>

          {storedScreenLoading && (
            <div className="flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-10 text-sm text-slate-500 shadow-sm">
              <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
              Running the fair-ranking model on the stored CVs…
            </div>
          )}

          {rankingError && !storedScreenLoading && (
            <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-sm font-semibold text-rose-700">Fair screening failed</div>
              <div className="mt-1 text-sm text-rose-600">{rankingError}</div>
            </div>
          )}

          {!storedScreenLoading && renderScreeningResults()}
        </div>
      )}


      {/* Deleting a posting — a running one has to be stopped first */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        size="sm"
        title="Delete this job posting?"
        subtitle={confirmDelete?.title || ""}
      >
        {confirmDelete && (() => {
          const running = !jobState(confirmDelete).isClosed;
          const applicantCount = getApplicantCount(confirmDelete.id);
          return (
            <div className="space-y-4">
              {running ? (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <Ban className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <div>
                    <div className="text-sm font-bold text-amber-800">This posting is still running</div>
                    <div className="mt-1 text-xs leading-5 text-amber-700">
                      Stop it before deleting.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  {applicantCount > 0 ? (
                    <>
                      {applicantCount} {applicantCount === 1 ? "person has" : "people have"} applied to this posting.
                      It will be removed from your list, and their applications are kept so they keep their own
                      history.
                    </>
                  ) : (
                    <>Nobody has applied to this posting, so it will be deleted outright.</>
                  )}
                </div>
              )}

              {jobError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{jobError}</div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                {running ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleStopJob(confirmDelete);
                      setConfirmDelete((j) => (j ? { ...j, status: "closed" } : j));
                    }}
                    disabled={jobBusyId === confirmDelete.id}
                    className="flex-1 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                  >
                    {jobBusyId === confirmDelete.id ? "Stopping…" : "Stop it first"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(confirmDelete)}
                    disabled={jobBusyId === confirmDelete.id}
                    className="flex-1 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    {jobBusyId === confirmDelete.id ? "Deleting…" : "Delete posting"}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* CV viewer — streams the file from GridFS with the caller's auth header */}
      <Modal
        open={!!cvModal}
        onClose={() => setCvModal(null)}
        size="lg"
        title={cvModal ? `${cvModal.name} — CV` : "CV"}
        subtitle={
          cvModal
            ? `${cvModal.jobTitle || ""} · applied ${new Date(cvModal.appliedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}`
            : ""
        }
      >
        {cvModal && (
          <div className="space-y-4">
            {cvModal.tags?.length ? <ApplicantTags tags={cvModal.tags} /> : null}
            <CvViewer
              fileId={cvModal.cvFileId}
              filename={cvModal.cvOriginalName}
              mimeType={cvModal.cvMimeType}
              height="65vh"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

export default JobPostsOnly;

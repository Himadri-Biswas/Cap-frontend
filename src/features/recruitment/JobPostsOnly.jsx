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
import Delta from "../../components/Delta.jsx";
import { Reveal, CountUp, ReadProgress } from "../../components/Motion.jsx";
import Section, { PageIntro } from "../../components/Section.jsx";
import Modal from "../../components/ui/Modal.jsx";
import CvViewer from "../../components/CvViewer.jsx";
import ApplicantTags, {
  ApplicantHistoryModal,
  HistoryButton,
  LastAppliedNote,
  TONE_BAR_CLASS,
  TONE_ROW_CLASS,
  tagTone,
} from "../../components/ApplicantTags.jsx";
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
    return { label: "NO SCORE", cls: "border-ink-600 bg-ink-750 text-mist-500", note: "The model returned no fair score for this CV." };
  }
  const pct = (score * 100).toFixed(1);
  if (score >= VERDICT_BANDS.high) {
    return {
      label: "HIGHLY PROBABLE",
      cls: "border-fair/35 bg-fair/12 text-fair",
      note: `${pct}% match, at or above ${VERDICT_BANDS.high * 100}%.`,
    };
  }
  if (score >= shortlistAt) {
    return {
      label: "SHORTLISTED",
      cls: "border-ok/35 bg-ok/12 text-ok",
      note: `${pct}% match, clears the ${(shortlistAt * 100).toFixed(0)}% bar.`,
    };
  }
  if (score >= VERDICT_BANDS.weak) {
    return {
      label: "WEAK MATCH",
      cls: "border-raw/35 bg-raw/12 text-raw",
      note: `${pct}% match, under the ${(shortlistAt * 100).toFixed(0)}% bar. Worth reading by hand.`,
    };
  }
  return {
    label: "REJECTED",
    cls: "border-risk/35 bg-risk/12 text-risk",
    note: `${pct}% match, below the ${VERDICT_BANDS.weak * 100}% floor.`,
  };
}

const SKILL_CATEGORY_META = {
  "programming language":                  { label: "Languages",     className: "border-ink-500 bg-ink-750 text-mist-200" },
  "framework or library":                  { label: "Frameworks",    className: "border-ok/35 bg-ok/12 text-ok" },
  "database or data store":                { label: "Databases",     className: "border-raw/35 bg-raw/12 text-raw" },
  "cloud or devops tool":                  { label: "Cloud/DevOps",  className: "border-brand/35 bg-brand/12 text-brand-hi" },
  "machine learning or AI concept":        { label: "ML & AI",       className: "border-risk/35 bg-risk/12 text-risk" },
  "soft skill":                            { label: "Soft Skills",   className: "border-ink-600 bg-ink-750 text-mist-200" },
  "methodology or process":                { label: "Methodology",   className: "border-fair/35 bg-fair/12 text-fair" },
  "cybersecurity and network security tool": { label: "Security",    className: "border-ink-500 bg-ink-750 text-mist-200" },
  "software testing and QA automation tool": { label: "Testing/QA",  className: "border-ink-500 bg-ink-750 text-mist-200" },
  "data visualization or BI tool":         { label: "Data Viz & BI", className: "border-brand/35 bg-brand/12 text-brand-hi" },
  "big data or pipeline technology":       { label: "Big Data/ETL",  className: "border-ink-500 bg-ink-750 text-mist-200" },
  "design or prototyping tool":            { label: "Design Tools",  className: "border-ink-500 bg-ink-750 text-mist-200" },
  "blockchain or web3 technology":         { label: "Blockchain",    className: "border-ink-500 bg-ink-750 text-mist-200" },
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
  if (n > 0.0005) return "text-raw";
  if (n < -0.0005) return "text-risk";
  return "text-mist-600";
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
    className: SKILL_CATEGORY_META[category]?.className || "border-ink-600 bg-ink-850 text-mist-200",
    items: categorized[category],
  }));
  const extraSections = Object.entries(categorized)
    .filter(([category, items]) => !SKILL_CATEGORY_ORDER.includes(category) && items?.length)
    .map(([category, items]) => ({
      category,
      label: formatCategoryLabel(category),
      className: "border-ink-600 bg-ink-850 text-mist-200",
      items,
    }));
  return [...knownSections, ...extraSections];
}

/** Small reusable shell so every result block reads as one numbered story. */
/* .data-table already sets the header type; this only picks the alignment. */
const TH = ({ children, align = "left", className = "" }) => (
  <th
    className={cx(
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
      className
    )}
  >
    {children}
  </th>
);

/**
 * A table in the report. `tone` sets which question it answers:
 *   raw   — an uncorrected reading      fair — a corrected one
 *   risk  — bias being charged          ok   — bias being removed
 *   brand — a decision
 */
function ScrollTable({ children, tone = "" }) {
  return (
    <div className="overflow-x-auto rounded-tile border border-ink-600">
      <table className={cx("data-table w-full min-w-[540px]", tone && `data-table--${tone}`)}>{children}</table>
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
        "flex w-full items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-mist-400 transition hover:bg-ink-750 hover:text-paper",
        className
      )}
    >
      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      See {Math.min(step, remaining)} more
      <span className="font-normal text-mist-600">({remaining} left)</span>
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
      <tbody>{items.slice(0, shown).map((item, i) => row(item, i))}</tbody>
      {remaining > 0 && (
        <tfoot>
          <tr>
            <td colSpan={columns} className="border-t border-ink-700 bg-ink-850 p-0">
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
          className="rounded-tile border border-ink-600 bg-ink-800"
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
  // The candidate whose full application history is open in a modal, or null.
  const [historyCandidate, setHistoryCandidate] = useState(null);

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
    if (stopped) return { label: "Stopped", cls: "bg-raw/12 text-raw border-raw/35", icon: Ban };
    if (deadlinePassed) return { label: "Closed", cls: "bg-risk/12 text-risk border-risk/35", icon: XCircle };
    return { label: "Ongoing", cls: "bg-brand/12 text-brand-hi border-brand/35", icon: CheckCircle2 };
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
    submitted: "border-ink-600 bg-ink-750 text-mist-400",
    under_review: "border-brand/35 bg-brand/12 text-brand-hi",
    shortlisted: "border-ok/35 bg-ok/12 text-ok",
    interview: "border-brand/35 bg-brand/12 text-brand-hi",
    offered: "border-brand/35 bg-brand/12 text-brand-hi",
    hired: "border-ok/35 bg-ok/12 text-ok",
    rejected: "border-risk/35 bg-risk/12 text-risk",
    withdrawn: "border-ink-600 bg-ink-750 text-mist-500",
  };

  // ── Post-a-job entry point (used to be the "+ New" button in the header) ──
  const PostJobPanel = () => (
    <div className="rounded-panel border border-ink-600 bg-ink-800 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-tile bg-brand text-white">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight text-paper">Post a job opening</div>
            <div className="mt-1 text-xs leading-5 text-mist-500">
              Upload or paste a job description. Required skills are extracted from it.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNewJob?.()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-tile bg-brand px-5 py-2.5 text-sm font-semibold text-paper transition hover:bg-brand"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          New job posting
        </button>
      </div>
    </div>
  );

  const JobList = () => (
    <div className="rounded-panel border border-ink-600 bg-ink-800 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-paper">Latest Job Posts</div>
        <Pill className="border border-ink-600 bg-ink-750 text-mist-200">{filteredJobs.length} job posts</Pill>
      </div>

      {jobNotice && (
        <div className="mt-3 flex items-start gap-2 rounded-tile border border-ok/35 bg-ok/12 p-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          <div className="flex-1 text-xs text-ok">{jobNotice}</div>
          <button onClick={() => setJobNotice("")} className="text-xs font-semibold text-ok">
            Dismiss
          </button>
        </div>
      )}
      {jobError && (
        <div className="mt-3 rounded-tile border border-risk/35 bg-risk/12 p-3 text-xs text-risk">{jobError}</div>
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
                className="rounded-tile border border-ink-600 bg-ink-800 transition hover:border-brand/35 hover:"
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
                      <div className="mt-1 h-10 w-1.5 rounded-full bg-ink-700" />
                      <div>
                        <div className="font-semibold text-paper">{job.title}</div>
                        <div className="mt-1 text-xs text-mist-500">
                          {job.dept} / {job.location}
                        </div>
                      </div>
                    </div>
                    <Pill className={cx("border shrink-0", status.cls)}>
                      <Icon className="mr-1 h-3.5 w-3.5" /> {status.label}
                    </Pill>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill className="border border-ink-600 bg-ink-750 text-mist-200">
                      Deadline: {job.deadline}
                    </Pill>
                    <Pill className="border border-ink-600 bg-ink-750 text-mist-200">
                      Applicants: {getApplicantCount(job.id)}
                    </Pill>
                  </div>
                </button>

                {/* Admin controls, kept outside the row button so a click here
                    never opens the posting by accident. */}
                <div className="flex items-center justify-end gap-1.5 border-t border-ink-700 px-3 py-2">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin text-mist-600" aria-hidden="true" />
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
                          className="inline-flex items-center gap-1.5 rounded-tile border border-ok/35 bg-ok/12 px-2.5 py-1.5 text-[11px] font-bold text-ok transition hover:bg-ok/12 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" aria-hidden="true" />
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
                          className="inline-flex items-center gap-1.5 rounded-tile border border-raw/35 bg-raw/12 px-2.5 py-1.5 text-[11px] font-bold text-raw transition hover:bg-raw/12 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Ban className="h-3 w-3" aria-hidden="true" />
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
                        className="inline-flex items-center gap-1.5 rounded-tile border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11px] font-bold text-mist-400 transition hover:border-risk/35 hover:bg-risk/12 hover:text-risk"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
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
        <div className="flex items-center justify-center gap-3 rounded-panel border border-ink-600 bg-ink-800 p-10 text-sm text-mist-500">
          <Loader2 className="h-5 w-5 animate-spin text-mist-200" aria-hidden="true" />
          Reading skills out of the job description and the CVs…
        </div>
      );
    }
    if (!rankingSkills) {
      return (
        <div className="rounded-panel border border-ink-600 bg-ink-800 p-6 text-sm text-mist-500">
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
            ? "border-ok/35 bg-ok/12 text-ok"
            : tone === "missing"
              ? "border-risk/35 bg-risk/12 text-risk"
              : "border-ink-600 bg-ink-850 text-mist-400"
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
          lede={`${jdItems.length} skill${jdItems.length === 1 ? "" : "s"} read out of the job description.`}
        >
          {jdSections.length === 0 ? (
            <div className="rounded-tile border border-ink-700 bg-ink-850 p-4 text-sm text-mist-500">
              The extractor found no skills in this job description.
            </div>
          ) : (
            <div className="space-y-2.5">
              {jdSections.map((section) => (
                <div key={section.category} className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                  <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-mist-600">
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
        <Section
          kicker="Coverage"
          title="Pick a candidate"
          lede="See how one person's skills line up against the list above."
        >
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
                      "rounded-tile border p-3 text-left transition",
                      isActive
                        ? "border-brand/35 bg-brand/18 ring-2 ring-brand/30"
                        : "border-ink-600 bg-ink-800 hover:bg-ink-750"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-paper">{candidate.name}</span>
                      <span className="shrink-0 text-xs font-mono text-mist-600">#{candidate.step2_fair?.rank}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-750">
                        <div
                          className="h-full rounded-full bg-fair"
                          style={{ width: `${coverage}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-mist-400">
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
            lede={`${activeSplit.cvItems.length} skill${activeSplit.cvItems.length === 1 ? "" : "s"} read out of this CV.`}
          >
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-tile border border-ok/35 bg-ok/10 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-ok">Matched</span>
                  <span className="font-mono text-sm font-bold text-ok">{activeSplit.matched.length}</span>
                </div>
                <p className="mt-1 text-xs text-ok/80">The job asks for these and the CV has them.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeSplit.matched.length === 0 ? (
                    <span className="text-xs text-mist-500">Nothing on the CV matched the job's list.</span>
                  ) : (
                    activeSplit.matched.map((item) => <SkillChip key={item.name} item={item} tone="matched" />)
                  )}
                </div>
              </div>

              <div className="rounded-tile border border-risk/35 bg-risk/10 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-risk">Missing</span>
                  <span className="font-mono text-sm font-bold text-risk">{activeSplit.missing.length}</span>
                </div>
                <p className="mt-1 text-xs text-risk/80">The job asks for these and the CV does not have them.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeSplit.missing.length === 0 ? (
                    <span className="text-xs text-mist-500">Nothing missing. The CV covers the whole list.</span>
                  ) : (
                    activeSplit.missing.map((item) => <SkillChip key={item.name} item={item} tone="missing" />)
                  )}
                </div>
              </div>

              <div className="rounded-tile border border-ink-600 bg-ink-850 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-paper">Extra</span>
                  <span className="font-mono text-sm font-bold text-mist-400">{activeSplit.extra.length}</span>
                </div>
                <p className="mt-1 text-xs text-mist-500">On the CV, but the job did not ask for them.</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeSplit.extra.length === 0 ? (
                    <span className="text-xs text-mist-500">Nothing beyond what the job asked for.</span>
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
      <div ref={resultsRef} className="stack-page">
        <ReadProgress />
        {/* Run header */}
        <div className="rounded-panel border border-ink-600 bg-ink-850 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-tile bg-ink-850 text-paper">
                <ShieldCheck className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <div className="display text-xl text-white">
                  Fair screening — {screenedJob.title || rankingResult?.metadata?.job_title || "this role"}
                </div>
                <div className="mt-2 max-w-md text-[13px] leading-6 feature-dim">
                  {candidates.length} stored CV{candidates.length > 1 ? "s" : ""}, scored twice — once by the original
                  model, once with background removed. Everything below compares the two readings.
                </div>
              </div>
            </div>
            <span className="num rounded-chip border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/80">
              Shortlisting bar {(shortlistAt * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Two views over the same run */}
        <div className="flex flex-wrap gap-2 rounded-tile border border-ink-600 bg-ink-750 p-1.5">
          {[
            { key: "scoring", label: "Candidate scoring details" },
            { key: "skills", label: "Skill analysis" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScreenTab(tab.key)}
              className={cx(
                "flex-1 rounded-tile px-4 py-2 text-sm font-semibold transition",
                screenTab === tab.key
                  ? "bg-ink-800 text-paper "
                  : "text-mist-500 hover:text-paper"
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
          kicker="Profiles"
          title="What the parser read off each CV"
          lede="These four attributes are the only things the debiased model is told to ignore. Everything else it sees is the CV itself."
        >
          <ScrollTable>
            <thead className="bg-ink-850">
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
                <tr key={candidate.id} className="border-t border-ink-700 hover:bg-ink-750/60">
                  <td className="font-semibold text-paper">{candidate.name}</td>
                  <td className="text-mist-200">{candidate.demographics?.university || "Not specified"}</td>
                  <td className="text-mist-200">{candidate.demographics?.gender || "Not specified"}</td>
                  <td className="text-mist-200">{candidate.demographics?.ethnicity || "Not specified"}</td>
                  <td className="text-mist-200">{candidate.demographics?.skin_color || "Not specified"}</td>
                </tr>
              )}
            />
          </ScrollTable>
        </Section>

        {/* 2 ── Biased model similarity ───────────────────────────────────── */}
        <Section
          step={2}
          kicker="The first reading"
          title="What the original model scored"
          lede="Each CV against this job description, before anything was corrected. This is the number the old pipeline would have hired on."
        >
          <ScrollTable tone="raw">
            <thead className="bg-ink-850">
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
                <tr key={candidate.id} className="border-t border-ink-700 hover:bg-ink-750/60">
                  <td className="">
                    <div className="font-semibold text-paper">{candidate.name}</div>
                    <div className="mt-0.5 text-xs text-mist-600">{candidate.demographics?.university}</div>
                  </td>
                  <td className="text-right font-mono font-semibold text-raw">
                    {formatScore(candidate.step1_biased?.final_biased_score)}
                  </td>
                  <td className="text-center font-semibold text-mist-200">
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
          kicker="Attribution"
          title="How much of that came from background"
          lede="Points each candidate gained or lost for who they are rather than what they wrote. A plus means the model added them; a minus means it took them away."
        >
          <ScrollTable tone="risk">
            <thead className="bg-ink-850">
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
                  <tr key={candidate.id} className="border-t border-ink-700 hover:bg-ink-750/60">
                    <td className="font-semibold text-paper">{candidate.name}</td>
                    {BIAS_FACTORS.map((f) => (
                      <td key={f.key} className={cx("text-right font-mono font-semibold", adjustmentClass(adj[f.key]))}>
                        {formatAdjustment(adj[f.key])}
                      </td>
                    ))}
                    <td className={cx("text-right font-mono font-bold", adjustmentClass(total))}>
                      {formatAdjustment(total)}
                    </td>
                    <td className="">
                      <span
                        className={cx(
                          "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                          total > 0.0005
                            ? "border-raw/35 bg-raw/12 text-raw"
                            : total < -0.0005
                              ? "border-risk/35 bg-risk/12 text-risk"
                              : "border-ink-600 bg-ink-750 text-mist-500"
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
          <p className="mt-3 text-xs text-mist-500">
            The score in step 2 is the CV's own reading plus this total, capped to the 0–1 range.
          </p>
        </Section>

        {/* 4 ── The same table, after debiasing ───────────────────────────── */}
        <Section
          step={4}
          kicker="Residual"
          title="What is left after debiasing"
          accentWord="left"
          lede="The same four factors measured again on the corrected model. The closer every figure sits to zero, the less a background still moves a score."
        >
          <ScrollTable tone="fair">
            <thead className="bg-ink-850">
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
                  <tr key={candidate.id} className="border-t border-ink-700 hover:bg-ink-750/60">
                    <td className="font-semibold text-paper">{candidate.name}</td>
                    {BIAS_FACTORS.map((f) => (
                      <td key={f.key} className={cx("text-right font-mono font-semibold", adjustmentClass(afterAdj[f.key]))}>
                        {formatAdjustment(afterAdj[f.key])}
                      </td>
                    ))}
                    <td className={cx("text-right font-mono font-bold", adjustmentClass(afterAdj.total))}>
                      {formatAdjustment(afterAdj.total)}
                    </td>
                    <td className="text-right font-mono text-xs text-mist-600 line-through">
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
          kicker="Per person"
          title="The same story, one candidate at a time"
          accentWord="story"
          lede="Every factor for every person, with a plain sentence under each table stating what actually happened to them."
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
                <div key={candidate.id} className="rounded-tile border border-ink-600 bg-ink-850 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-paper">{candidate.name}</span>
                    <span className="text-xs text-mist-500">
                      {candidate.demographics?.university} · {candidate.demographics?.gender} ·{" "}
                      {candidate.demographics?.ethnicity}
                    </span>
                  </div>

                  <div className="mt-3 overflow-x-auto rounded-tile border border-ink-600 bg-ink-800">
                    <table className="data-table data-table--risk w-full min-w-[520px] text-xs">
                      <thead className="bg-ink-850">
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
                            <tr key={f.key} className="border-t border-ink-700">
                              <td className="font-medium text-mist-200">{f.label}</td>
                              <td className={cx("text-right font-mono font-semibold", adjustmentClass(b))}>
                                {formatAdjustment(b)}
                              </td>
                              <td className={cx("text-right font-mono font-semibold", adjustmentClass(a))}>
                                {formatAdjustment(a)}
                              </td>
                              <td className="text-right">
                                {pct >= 90 ? (
                                  <span className="font-semibold text-ok">✓ {pct}%</span>
                                ) : (
                                  <span className="text-mist-500">{pct}%</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="border-t-2 border-ink-600 bg-ink-850">
                          <td className="font-semibold text-paper">
                            Total points {rewarded ? "gained" : "lost"}
                          </td>
                          <td className={cx("text-right font-mono font-bold", adjustmentClass(total))}>
                            {formatAdjustment(total)}
                          </td>
                          <td className={cx("text-right font-mono font-bold", adjustmentClass(totalAfter))}>
                            {formatAdjustment(totalAfter)}
                          </td>
                          <td className={cx("text-right font-semibold", totalRemoved >= 60 ? "text-ok" : "text-mist-500")}>
                            {totalRemoved}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-2.5 text-xs leading-5 text-mist-400">
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
          kicker="Totals"
          title="How much the correction removed"
          lede="Points of background effect the debiased model stripped out, per person."
        >
          <ScrollTable tone="ok">
            <thead className="bg-ink-850">
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
                  <tr key={candidate.id} className="border-t border-ink-700 hover:bg-ink-750/60">
                    <td className="font-semibold text-paper">{candidate.name}</td>
                    <td className="text-right font-mono font-semibold text-paper">{total.toFixed(3)}</td>
                    <td className="text-right font-mono font-semibold text-mist-500">{left.toFixed(3)}</td>
                    <td className="text-right font-mono font-bold text-ok">{erased.toFixed(3)}</td>
                    <td className="">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-full min-w-[80px] overflow-hidden rounded-full bg-ink-750">
                          <div
                            className="h-full rounded-full bg-fair"
                            style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right font-mono text-xs font-semibold text-ok">
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
          kicker="The fair reading"
          title="How the corrected model ranks them"
          lede="The same CVs against the same job, scored once background stopped counting. Best first."
        >
          <ScrollTable tone="fair">
            <thead className="bg-ink-850">
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
                  <tr key={candidate.id} className="border-t border-ink-700 hover:bg-ink-750/60">
                    <td className="text-center">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-ink-850 text-xs font-bold text-paper">
                        {candidate.step2_fair?.rank}
                      </span>
                    </td>
                    <td className="">
                      <div className="font-semibold text-paper">{candidate.name}</div>
                      <div className="mt-0.5 text-xs text-mist-600">{candidate.demographics?.university}</div>
                    </td>
                    <td className="text-right font-mono font-bold text-ok">{formatScore(fair)}</td>
                    <td className="">
                      <div className="h-2 w-full min-w-[100px] overflow-hidden rounded-full bg-ink-750">
                        <div
                          className="h-full rounded-full bg-fair"
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
          kicker="Comparison"
          title="Both readings, side by side"
          lede="Amber is the original score, teal the corrected one. The gap between the two bar ends is the correction."
        >
          {/* Amber is always the uncorrected reading, aqua the corrected one —
              the same pairing the whole product uses. */}
          <div className="mb-4 flex flex-wrap items-center gap-4 text-[11px] font-medium text-mist-500">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-raw" />
              Initial model
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-fair" />
              After debiasing
            </span>
          </div>
          <PagedList
            className="space-y-4"
            resetKey={runId}
            items={byFairRank}
            row={(candidate, i) => (
              <Delta
                key={candidate.id}
                index={i}
                title={candidate.name}
                meta={`#${candidate.step1_biased?.rank} → #${candidate.step2_fair?.rank}`}
                before={candidate.step1_biased?.final_biased_score ?? 0}
                after={candidate.step2_fair?.fair_similarity ?? 0}
                beforeLabel="Initial"
                afterLabel="Debiased"
                max={1}
              />
            )}
          />
        </Section>

        {/* 8 ── Fairness impact, explained ────────────────────────────────── */}
        <Reveal className="feature">
          <div className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-xl">
                <div className="num text-[10px] font-medium uppercase tracking-[0.2em] feature-faint">
                  Step 8 · Fairness impact
                </div>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="num display-xl text-grad text-[68px] text-[#3ee0cd]">
                    <CountUp value={improvement.spread_reduction_pct ?? 0} decimals={1} suffix="%" />
                  </span>
                  <span className="text-sm font-medium feature-dim">of the score gap closed</span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-6 feature-dim">
                  The score gap is the distance between the top and bottom score in this batch. It was{" "}
                  <span className="font-mono font-semibold text-paper">{formatScore(before.score_spread)}</span>, and
                  part of that came from university, gender, skin colour and ethnicity rather than the CVs. After
                  debiasing it is{" "}
                  <span className="font-mono font-semibold text-fair">{formatScore(after.score_spread)}</span>.
                  So {improvement.spread_reduction_pct ?? 0}% of the gap was background, not skills.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="feature-well px-4 py-3">
                  <div className="text-[11px] font-medium feature-faint">Gained the most</div>
                  <div className="mt-1 text-sm font-semibold text-white">{improvement.most_improved || "—"}</div>
                  <div className="mt-0.5 text-[11px] feature-faint">was losing the most points</div>
                </div>
                <div className="feature-well px-4 py-3">
                  <div className="text-[11px] font-medium feature-faint">Came down the most</div>
                  <div className="mt-1 text-sm font-semibold text-white">{improvement.most_corrected || "—"}</div>
                  <div className="mt-0.5 text-[11px] feature-faint">was gaining the most points</div>
                </div>
                <div className="feature-well px-4 py-3">
                  <div className="text-[11px] font-medium feature-faint">Over the bar before</div>
                  <div className="num mt-1 text-xl font-bold text-white">
                    {before.shortlisted_count ?? 0}
                    <span className="ml-1 text-sm font-normal feature-faint">/ {summary.total_candidates ?? candidates.length}</span>
                  </div>
                </div>
                <div className="feature-well px-4 py-3">
                  <div className="text-[11px] font-medium feature-faint">Over the bar after</div>
                  <div className="mt-1 text-xl font-bold text-fair">
                    {after.shortlisted_count ?? 0}
                    <span className="ml-1 text-sm font-normal feature-faint">/ {summary.total_candidates ?? candidates.length}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Before / after statistics, each with what it means */}
            <div className="mt-6 overflow-x-auto feature-well">
              <table className="data-table w-full min-w-[560px]">
                <thead>
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-mist-600">
                    <th className="">Measure</th>
                    <th className="text-right">Initial model</th>
                    <th className="text-right">After debiasing</th>
                    <th className="">What this measure means</th>
                  </tr>
                </thead>
                <tbody>
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
                    <tr key={row.label} className="border-t border-ink-500/10">
                      <td className="font-medium text-white">{row.label}</td>
                      <td className="text-right font-mono text-raw">{formatScore(row.before)}</td>
                      <td className="text-right font-mono font-semibold text-fair">
                        {formatScore(row.after)}
                      </td>
                      <td className="text-xs leading-5 text-mist-600">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Which attribute was doing the damage */}
            {Object.keys(perAttribute).length > 0 && (
              <div className="mt-4 overflow-x-auto feature-well">
                <table className="data-table w-full min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-mist-600">
                      <th className="">Background factor</th>
                      <th className="text-right">Most points it added</th>
                      <th className="text-right">Most points it took</th>
                      <th className="text-right">Points it could swing</th>
                      <th className="text-right">Points it swings now</th>
                      <th className="">Does it still decide anything?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BIAS_FACTORS.filter((f) => perAttribute[f.key]).map((f) => {
                      const stats = perAttribute[f.key];
                      const settled = (stats.fair_score_group_spread ?? 0) < 0.01;
                      return (
                        <tr key={f.key} className="border-t border-ink-500/10">
                          <td className="font-medium text-white">{f.label}</td>
                          <td className="text-right font-mono text-raw">
                            {formatAdjustment(stats.max_bonus)}
                          </td>
                          <td className="text-right font-mono text-risk">
                            {formatAdjustment(stats.max_penalty)}
                          </td>
                          <td className="text-right font-mono text-mist-700">
                            {(stats.adjustment_range ?? 0).toFixed(3)}
                          </td>
                          <td className="text-right font-mono font-semibold text-fair">
                            {(stats.fair_score_group_spread ?? 0).toFixed(4)}
                          </td>
                          <td className="text-xs">
                            <span
                              className={cx(
                                "rounded-full px-2 py-0.5 font-semibold",
                                settled ? "bg-fair/15 text-fair" : "bg-raw/15 text-raw"
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
        </Reveal>

        {/* 9 ── Rank movement with a comment ──────────────────────────────── */}
        <Section
          step={9}
          kicker="Movement"
          title="Who moved, and why they moved"
          lede="Sorted by how far the correction shifted each candidate. Biggest gains first, biggest corrections last."
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
                      "flex flex-col gap-2 rounded-tile border p-3 sm:flex-row sm:items-center sm:gap-4",
                      move > 0
                        ? "border-ok/35 bg-ok/10"
                        : move < 0
                          ? "border-raw/35 bg-raw/10"
                          : "border-ink-600 bg-ink-850"
                    )}
                  >
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="flex items-center gap-1.5 font-mono text-sm">
                        <span className="text-mist-600">#{candidate.step1_biased?.rank}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-mist-700" aria-hidden="true" />
                        <span className="font-bold text-paper">#{candidate.step2_fair?.rank}</span>
                      </div>
                      <span
                        className={cx(
                          "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-bold",
                          move > 0
                            ? "border-ok/35 bg-ink-800 text-ok"
                            : move < 0
                              ? "border-raw/35 bg-ink-800 text-raw"
                              : "border-ink-600 bg-ink-800 text-mist-500"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {move === 0 ? "same" : Math.abs(move)}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-paper">{candidate.name}</div>
                      <div className="mt-0.5 text-xs leading-5 text-mist-400">{rankComment(candidate)}</div>
                    </div>
                  </div>
                );
              }}
          />
        </Section>

        {/* 10 ── Final decision ───────────────────────────────────────────── */}
        <Section
          step={10}
          kicker="Decision"
          title="The shortlist"
          lede={`Scored by the debiased model. ${(VERDICT_BANDS.high * 100).toFixed(0)}%+ highly probable, ${(shortlistAt * 100).toFixed(0)}%+ shortlisted, ${(VERDICT_BANDS.weak * 100).toFixed(0)}%+ weak match, below that rejected. Shortlist and reject save to the application and notify the applicant.`}
        >
          {statusNotice && (
            <div className="mb-3 flex items-start gap-2 rounded-tile border border-ok/35 bg-ok/12 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
              <div className="flex-1 text-xs text-ok">{statusNotice}</div>
              <button onClick={() => setStatusNotice("")} className="text-xs font-semibold text-ok">
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
                    "relative overflow-hidden rounded-tile border p-4",
                    applicant?.tone === "positive"
                      ? "border-ok/35 bg-ok/10"
                      : applicant?.tone === "negative"
                        ? "border-risk/35 bg-risk/10"
                        : applicant?.tone === "mixed"
                          ? "border-raw/35 bg-raw/10"
                          : "border-ink-600 bg-ink-800"
                  )}
                >
                  {/* Tone stripe: green = returning/shortlisted before, red = rejected before */}
                  <span className={cx("absolute left-0 top-0 h-full w-1", TONE_BAR_CLASS[applicant?.tone] || "bg-transparent")} />

                  <div className="flex flex-wrap items-start justify-between gap-3 pl-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-850 text-xs font-bold text-paper">
                        {candidate.step2_fair?.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-paper">{candidate.name}</span>
                          <span className={cx("rounded-full border px-2.5 py-0.5 text-[11px] font-bold", verdict.cls)}>
                            {verdict.label}
                          </span>
                          {applicant?.tags?.length ? <ApplicantTags tags={applicant.tags} size="xs" /> : null}
                        </div>
                        <div className="mt-1 text-xs text-mist-500">{verdict.note}</div>

                        {/* Item 11 — the previous-employee highlight, kept intact */}
                        {applicant?.isFormerEmployee && (
                          <div className="mt-2 inline-block rounded-tile border border-ok/35 bg-ink-800 px-3 py-1.5 text-[11px] text-ok">
                            <span className="font-semibold">Worked here before</span>
                            {applicant.formerRole ? ` as ${applicant.formerRole}` : ""}
                            {applicant.formerDepartment ? ` in ${applicant.formerDepartment}` : ""}
                            {applicant.formerTenureYears != null ? ` · ${applicant.formerTenureYears} years tenure` : ""}
                          </div>
                        )}

                        {/* Was shortlisted on an earlier application — a positive
                            signal distinct from having worked here. */}
                        {applicant?.wasPreviouslyShortlisted && (
                          <div className="mt-2 inline-block rounded-tile border border-ok/35 bg-ink-800 px-3 py-1.5 text-[11px] text-ok">
                            <span className="font-semibold">Shortlisted {applicant.previousShortlistCount}×</span> before,
                            re-applying.
                          </div>
                        )}

                        {/* Item 12 — the applied-before-and-rejected history, kept intact */}
                        {applicant?.wasPreviouslyRejected && (
                          <div className="mt-2 inline-block rounded-tile border border-risk/35 bg-ink-800 px-3 py-1.5 text-[11px] text-risk">
                            <span className="font-semibold">Rejected {applicant.previousRejectionCount}×</span> before
                            and has applied again.
                          </div>
                        )}
                        {applicant ? <LastAppliedNote application={applicant} /> : null}
                        {applicant?.previousApplicationCount > 0 && (
                          <HistoryButton
                            count={applicant.previousApplicationCount}
                            onClick={() => setHistoryCandidate(applicant)}
                            className="mt-2"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="font-mono text-lg font-bold text-ok">{formatScore(fair)}</div>
                        <div className="text-[11px] text-mist-600">
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
                            {applicant.status === "shortlisted" && <ThumbsUp className="h-3 w-3" aria-hidden="true" />}
                            {applicant.status === "rejected" && <ThumbsDown className="h-3 w-3" aria-hidden="true" />}
                            {applicant.status.replace(/_/g, " ")}
                          </span>

                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleSetStatus(applicant.applicationId, "shortlisted")}
                              disabled={busy || applicant.status === "shortlisted"}
                              title="Save as shortlisted and notify the applicant"
                              className="inline-flex items-center justify-center gap-1.5 rounded-tile border border-ok/35 bg-ok/12 px-3 py-2 text-xs font-bold text-ok hover:bg-ok/12 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />}
                              {applicant.status === "shortlisted" ? "Shortlisted" : "Shortlist"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetStatus(applicant.applicationId, "rejected")}
                              disabled={busy || applicant.status === "rejected"}
                              title="Save as rejected and notify the applicant"
                              className="inline-flex items-center justify-center gap-1.5 rounded-tile border border-risk/35 bg-risk/12 px-3 py-2 text-xs font-bold text-risk hover:bg-risk/12 disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />}
                              {applicant.status === "rejected" ? "Rejected" : "Reject"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <span className="rounded-tile border border-ink-600 bg-ink-850 px-2.5 py-1.5 text-[11px] text-mist-500">
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
        <div className="space-y-7">
          <PageIntro
            kicker="Hiring"
            title="Open roles and fair screening"
            accentWord="fair"
            lede="Post a role, collect CVs, then screen the whole batch twice — once by the original model and once with background removed — and compare the two."
          />
          <PostJobPanel />
          <JobList />
        </div>
      )}

      {/* ── Screen 2: one posting, its applicants underneath ──────────── */}
      {view === "job" && selected && (
        <div className="space-y-4">
          {/* Back out to the list, plus the controls for this posting */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-ink-600 bg-ink-800 p-4">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setSelectedJobId(null);
                setSelectedCandidateId(null);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-semibold text-mist-200 transition hover:bg-ink-750"
            >
              <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
              All job posts
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {jobBusyId === selected.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-mist-600" aria-hidden="true" />
              ) : jobState(selected).stopped ? (
                <button
                  type="button"
                  onClick={() => handleReopenJob(selected)}
                  disabled={jobState(selected).deadlinePassed}
                  className="inline-flex items-center gap-1.5 rounded-tile border border-ok/35 bg-ok/12 px-3 py-2 text-xs font-bold text-ok transition hover:bg-ok/12 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  Reopen posting
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleStopJob(selected)}
                  disabled={jobState(selected).deadlinePassed}
                  className="inline-flex items-center gap-1.5 rounded-tile border border-raw/35 bg-raw/12 px-3 py-2 text-xs font-bold text-raw transition hover:bg-raw/12 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  Stop posting
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setJobError("");
                  setConfirmDelete(selected);
                }}
                className="inline-flex items-center gap-1.5 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-xs font-bold text-mist-400 transition hover:border-risk/35 hover:bg-risk/12 hover:text-risk"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Delete
              </button>
            </div>
          </div>

          {jobNotice && (
            <div className="flex items-start gap-2 rounded-tile border border-ok/35 bg-ok/12 p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
              <div className="flex-1 text-xs text-ok">{jobNotice}</div>
              <button onClick={() => setJobNotice("")} className="text-xs font-semibold text-ok">
                Dismiss
              </button>
            </div>
          )}
          {jobError && (
            <div className="rounded-tile border border-risk/35 bg-risk/12 p-3 text-xs text-risk">{jobError}</div>
          )}


          <div className="rounded-panel border border-ink-600 bg-ink-800 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-paper">Job Details</div>
              <button
                onClick={() => {
                  setSelectedJobId(null);
                  setSelectedCandidateId(null);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-brand/35 bg-brand/12 px-3 py-1 text-xs font-semibold text-brand-hi hover:bg-brand/12"
              >
                <ArrowRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
                Back
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xl font-bold tracking-tight text-paper">{selected.title}</div>
                  <div className="mt-1 text-sm text-mist-500">
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

              <div className="rounded-tile border border-ink-600 bg-ink-850 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-mist-200">Summary</div>
                <div className="mt-2 text-sm text-mist-200">{selected.summary}</div>
              </div>

              <div className="rounded-tile border border-ink-600 bg-ink-850 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-mist-200">Key skills</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selected.skills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center rounded-full border border-ink-600 bg-ink-800 px-3 py-1 text-xs text-mist-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-tile border border-ink-600 bg-ink-850 p-4">
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <div>
                    <div className="text-xs text-mist-500">Posted</div>
                    <div className="font-semibold text-paper">{selected.created}</div>
                  </div>
                  <div>
                    <div className="text-xs text-mist-500">Deadline</div>
                    <div className="font-semibold text-paper">{selected.deadline}</div>
                  </div>
                  <div>
                    <div className="text-xs text-mist-500">Applicants</div>
                    <div className="font-semibold text-paper">{getApplicantCount(selected.id)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-panel border border-ink-600 bg-ink-800 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-paper">Applicants</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => loadApplicants(selectedJobId)}
                  disabled={applicantsLoading}
                  className="rounded-full p-1.5 text-mist-600 transition hover:bg-ink-700 hover:text-mist-200 disabled:opacity-50"
                  title="Reload applicants"
                >
                  <RefreshCw className={cx("h-3.5 w-3.5", applicantsLoading && "animate-spin")} />
                </button>
                <Pill className="border border-ink-600 bg-ink-750 text-mist-200">
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
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-tile bg-ink-850 px-3 py-2 text-xs font-bold text-paper transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {storedScreenLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    Screening {rankedApplicants.length} stored CVs…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Fair-screen these {rankedApplicants.length} applicants
                  </>
                )}
              </button>
            )}

            {applicantsError && (
              <div className="mt-3 rounded-tile border border-risk/35 bg-risk/12 p-3 text-xs text-risk">
                {applicantsError}
              </div>
            )}

            {applicantsLoading && rankedApplicants.length === 0 ? (
              <div className="mt-3 flex items-center justify-center gap-2 rounded-tile border border-ink-600 bg-ink-850 p-6 text-sm text-mist-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading applicants…
              </div>
            ) : rankedApplicants.length === 0 ? (
              <div className="mt-3 rounded-tile border border-ink-600 bg-ink-850 p-4 text-sm text-mist-400">
                No applicants yet for this job.
              </div>
            ) : (
              // Job details sit above; the applicants read across from here —
              // the ranking on the left, whoever is selected on the right.
              <div className="mt-3 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="overflow-hidden rounded-tile border border-ink-600">
                  <table className="data-table data-table--brand w-full">
                    <thead className="bg-ink-850">
                      <tr className="text-left text-mist-400">
                        <th className="w-14 px-3 py-2 font-semibold">Rank</th>
                        <th className="font-semibold">Candidate Name</th>
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
                              "relative cursor-pointer border-t border-ink-600 transition",
                              isActive ? "bg-brand/12" : TONE_ROW_CLASS[candidate.tone] || "hover:bg-ink-750"
                            )}
                            onClick={() => setSelectedCandidateId(candidate.id)}
                          >
                            <td className="relative px-3 py-2 font-mono text-mist-200">
                              {/* Tone stripe: green = returning/shortlisted before, red = rejected before */}
                              <span
                                className={cx(
                                  "absolute left-0 top-0 h-full w-1",
                                  TONE_BAR_CLASS[candidate.tone] || "bg-transparent"
                                )}
                              />
                              {candidate.rank}
                            </td>
                            <td className="">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold text-paper">
                                  {candidate.name
                                    .split(" ")
                                    .slice(0, 2)
                                    .map((part) => part[0])
                                    .join(" ")}
                                </div>
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-paper">{candidate.name}</div>
                                  {candidate.tags?.length ? (
                                    <ApplicantTags tags={candidate.tags} size="xs" className="mt-1" />
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-750">
                                  <div
                                    className={cx(
                                      "h-full rounded-full transition-[width,transform] duration-500",
                                      candidate.scoreSource && candidate.scoreSource !== "heuristic"
                                        ? "bg-ok"
                                        : "bg-brand"
                                    )}
                                    style={{ width: `${Math.round(candidate.score * 100)}%` }}
                                  />
                                </div>
                                <span className="font-mono text-mist-200">{(candidate.score * 100).toFixed(0)}%</span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-mist-600">
                                {candidate.scoreSource && candidate.scoreSource !== "heuristic" ? (
                                  <>
                                    <span className="font-semibold text-ok">fair model</span>
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
                    "rounded-tile border p-4",
                    selectedCandidate?.tone === "positive"
                      ? "border-ok/35 bg-ok/18"
                      : selectedCandidate?.tone === "negative"
                        ? "border-risk/35 bg-risk/18"
                        : selectedCandidate?.tone === "mixed"
                          ? "border-raw/35 bg-raw/18"
                          : "border-ink-600 bg-ink-850"
                  )}
                >
                  {!selectedCandidate ? null : (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-base font-bold text-paper">{selectedCandidate.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-mist-500">
                            <Mail className="h-3 w-3" aria-hidden="true" />
                            <span className="truncate">{selectedCandidate.email}</span>
                          </div>
                        </div>
                        <Pill className="shrink-0 border border-brand/35 bg-brand/12 text-brand-hi">
                          Score: {(selectedCandidate.score * 100).toFixed(0)}%
                        </Pill>
                      </div>

                      {/* POSITIVE / NEGATIVE re-application tags */}
                      {selectedCandidate.tags?.length ? (
                        <ApplicantTags tags={selectedCandidate.tags} className="mt-3" />
                      ) : null}

                      {selectedCandidate.isFormerEmployee && (
                        <div className="mt-2 rounded-tile border border-ok/35 bg-ink-800 px-3 py-2 text-xs text-ok">
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

                      {selectedCandidate.wasPreviouslyShortlisted && (
                        <div className="mt-2 rounded-tile border border-ok/35 bg-ink-800 px-3 py-2 text-xs text-ok">
                          <span className="font-semibold">
                            Shortlisted {selectedCandidate.previousShortlistCount}×
                          </span>{" "}
                          before, re-applying.
                        </div>
                      )}

                      {selectedCandidate.wasPreviouslyRejected && (
                        <div className="mt-2 rounded-tile border border-risk/35 bg-ink-800 px-3 py-2 text-xs text-risk">
                          <span className="font-semibold">
                            Rejected {selectedCandidate.previousRejectionCount}×
                          </span>{" "}
                          before and has applied again.
                        </div>
                      )}

                      {/* "Admin can click his entry and see his last applied date" */}
                      <LastAppliedNote application={selectedCandidate} />
                      {selectedCandidate.previousApplicationCount > 0 && (
                        <HistoryButton
                          count={selectedCandidate.previousApplicationCount}
                          onClick={() => setHistoryCandidate(selectedCandidate)}
                          className="mt-2"
                        />
                      )}

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-tile border border-ink-600 bg-ink-800 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-mist-600">Applied</div>
                          <div className="mt-0.5 text-xs font-semibold text-paper">
                            {new Date(selectedCandidate.appliedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                          </div>
                        </div>
                        <div className="rounded-tile border border-ink-600 bg-ink-800 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-mist-600">Status</div>
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
                        <div className="mt-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-mist-400">
                          {selectedCandidate.currentTitle}
                          {selectedCandidate.yearsExperience != null
                            ? ` · ${selectedCandidate.yearsExperience} yrs experience`
                            : ""}
                          {selectedCandidate.location ? ` · ${selectedCandidate.location}` : ""}
                        </div>
                      ) : null}

                      {selectedCandidate.coverLetter ? (
                        <div className="mt-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-mist-600">Cover letter</div>
                          <div className="mt-1 text-xs leading-5 text-mist-400">{selectedCandidate.coverLetter}</div>
                        </div>
                      ) : null}

                      <div className="mt-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold uppercase tracking-wider text-mist-200">Skills</div>
                          {selectedCandidate.extractionStatus === "done" ? (
                            <span className="text-[10px] font-semibold text-ok">GLiNER extracted</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleReextract(selectedCandidate.applicationId)}
                              disabled={statusBusy === selectedCandidate.applicationId}
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-hi hover:text-brand-hi disabled:opacity-50"
                            >
                              {statusBusy === selectedCandidate.applicationId ? (
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                              ) : (
                                <Sparkles className="h-3 w-3" aria-hidden="true" />
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
                                    ? "border-brand/35 bg-brand/12 text-brand-hi"
                                    : "border-ink-600 bg-ink-850 text-mist-200"
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
                          className="inline-flex w-full items-center justify-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-semibold text-paper hover:bg-ink-750 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          {selectedCandidate.cvFileId ? "View CV" : "No CV attached"}
                        </button>

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleSetStatus(selectedCandidate.applicationId, "shortlisted")}
                            disabled={statusBusy === selectedCandidate.applicationId || selectedCandidate.status === "shortlisted"}
                            className="inline-flex items-center justify-center gap-1.5 rounded-tile border border-ok/35 bg-ok/12 px-3 py-2 text-xs font-bold text-ok hover:bg-ok/12 disabled:opacity-50"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                            Shortlist
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetStatus(selectedCandidate.applicationId, "rejected")}
                            disabled={statusBusy === selectedCandidate.applicationId || selectedCandidate.status === "rejected"}
                            className="inline-flex items-center justify-center gap-1.5 rounded-tile border border-risk/35 bg-risk/12 px-3 py-2 text-xs font-bold text-risk hover:bg-risk/12 disabled:opacity-50"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-ink-600 bg-ink-800 p-4">
            <button
              type="button"
              onClick={() => {
                setView("job");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex items-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-semibold text-mist-200 transition hover:bg-ink-750"
            >
              <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
              Back to {selected?.title || "the job"}
            </button>
            <button
              type="button"
              onClick={handleScreenStoredCvs}
              disabled={storedScreenLoading}
              className="inline-flex items-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-xs font-semibold text-mist-200 transition hover:bg-ink-750 disabled:opacity-50"
            >
              <RefreshCw className={cx("h-3.5 w-3.5", storedScreenLoading && "animate-spin")} />
              Run again
            </button>
          </div>

          {storedScreenLoading && (
            <div className="flex items-center justify-center gap-3 rounded-panel border border-ink-600 bg-ink-800 p-10 text-sm text-mist-500">
              <Loader2 className="h-5 w-5 animate-spin text-mist-200" aria-hidden="true" />
              Running the fair-ranking model on the stored CVs…
            </div>
          )}

          {rankingError && !storedScreenLoading && (
            <div className="rounded-panel border border-risk/35 bg-risk/12 p-4">
              <div className="text-sm font-semibold text-risk">Fair screening failed</div>
              <div className="mt-1 text-sm text-risk">{rankingError}</div>
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
                <div className="flex items-start gap-3 rounded-tile border border-raw/35 bg-raw/12 p-4">
                  <Ban className="mt-0.5 h-5 w-5 shrink-0 text-raw" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-bold text-raw">This posting is still running</div>
                    <div className="mt-1 text-xs leading-5 text-raw">
                      Stop it before deleting.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-tile border border-ink-600 bg-ink-850 p-4 text-sm text-mist-200">
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
                <div className="rounded-tile border border-risk/35 bg-risk/12 p-3 text-xs text-risk">{jobError}</div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded-tile border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm font-semibold text-mist-200 transition hover:bg-ink-750"
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
                    className="flex-1 rounded-tile bg-raw px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-raw disabled:opacity-60"
                  >
                    {jobBusyId === confirmDelete.id ? "Stopping…" : "Stop it first"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDeleteJob(confirmDelete)}
                    disabled={jobBusyId === confirmDelete.id}
                    className="flex-1 rounded-tile bg-risk px-4 py-2.5 text-sm font-semibold text-paper transition hover:bg-risk disabled:opacity-60"
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
            <div className="flex flex-wrap items-center gap-2">
              {cvModal.tags?.length ? <ApplicantTags tags={cvModal.tags} /> : null}
              {cvModal.previousApplicationCount > 0 && (
                <HistoryButton
                  count={cvModal.previousApplicationCount}
                  onClick={() => setHistoryCandidate(cvModal)}
                />
              )}
            </div>
            <CvViewer
              fileId={cvModal.cvFileId}
              filename={cvModal.cvOriginalName}
              mimeType={cvModal.cvMimeType}
              height="65vh"
            />
          </div>
        )}
      </Modal>

      {/* Full prior-application timeline behind a "previously shortlisted" /
          "previously rejected" tag — opened from any History button above. */}
      <ApplicantHistoryModal
        open={!!historyCandidate}
        onClose={() => setHistoryCandidate(null)}
        applicant={historyCandidate}
      />
    </div>
  );
}

export default JobPostsOnly;

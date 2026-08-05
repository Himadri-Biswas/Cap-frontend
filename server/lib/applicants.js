/**
 * applicants.js — the re-application intelligence behind the admin's tags.
 *
 * Three questions get answered here, all keyed off the applicant's email
 * (the one identifier that survives across a person's employment history):
 *
 *   1. Did this person work here before?      → POSITIVE tag `former_employee`
 *   2. Have we rejected them before?          → NEGATIVE tag `previously_rejected`
 *   3. When did they last apply, and may they apply again yet?
 */
import { Application, Employee, AppSetting } from "../models/index.js";
import { config } from "../config.js";

/** Reads the cooldown window: per-job override → app_settings → env default. */
export async function resolveCooldownHours(job) {
  if (job?.reapplyCooldownHours != null) return Number(job.reapplyCooldownHours);
  const setting = await AppSetting.findOne({ key: "reapplyCooldownHours" }).lean();
  const value = Number(setting?.value);
  return Number.isFinite(value) && value >= 0 ? value : config.reapplyCooldownHours;
}

/**
 * Can this user apply to this job right now?
 * Returns {allowed, reason, lastApplication, nextEligibleAt, hoursRemaining}.
 */
export async function checkCooldown({ clerkUserId, email, jobId, job }) {
  const cooldownHours = await resolveCooldownHours(job);

  const last = await Application.findOne({
    jobId,
    $or: [{ clerkUserId }, { applicantEmail: (email || "").toLowerCase() }],
    status: { $ne: "withdrawn" },
  })
    .sort({ appliedAt: -1 })
    .lean();

  if (!last) return { allowed: true, cooldownHours, lastApplication: null };

  const nextEligibleAt = new Date(new Date(last.appliedAt).getTime() + cooldownHours * 3600_000);
  const now = Date.now();

  if (now >= nextEligibleAt.getTime()) {
    return { allowed: true, cooldownHours, lastApplication: last, nextEligibleAt };
  }

  const msLeft = nextEligibleAt.getTime() - now;
  return {
    allowed: false,
    cooldownHours,
    lastApplication: last,
    nextEligibleAt,
    hoursRemaining: Math.ceil(msLeft / 3600_000),
    minutesRemaining: Math.ceil(msLeft / 60_000),
    reason: `You already applied to this job on ${new Date(last.appliedAt).toLocaleString()}. You can re-apply after ${nextEligibleAt.toLocaleString()}.`,
  };
}

/**
 * Builds the history block stamped onto a new Application: the tags, the
 * previous-application list and the last-applied pointers.
 */
export async function buildApplicantHistory({ clerkUserId, email, jobId }) {
  const lowered = (email || "").toLowerCase();
  const identity = { $or: [{ clerkUserId }, { applicantEmail: lowered }] };

  const [priorApps, employeeRecord] = await Promise.all([
    Application.find(identity).sort({ appliedAt: -1 }).lean(),
    Employee.findOne({ $or: [{ email: lowered }, { userEmail: lowered }] }).lean(),
  ]);

  const tags = new Set();
  const history = {
    tags: [],
    previousApplicationCount: priorApps.length,
    previousApplications: priorApps.slice(0, 20).map((a) => ({
      applicationId: a.applicationId,
      jobId: a.jobId,
      jobTitle: a.jobTitle,
      appliedAt: a.appliedAt,
      status: a.status,
      score: a.score,
    })),
    isFormerEmployee: false,
    isInternalCandidate: false,
    wasPreviouslyRejected: false,
    previousRejectionCount: 0,
    lastAppliedAt: null,
    lastAppliedJobId: null,
    lastAppliedJobTitle: null,
    lastAppliedStatus: null,
  };

  // ── 1. Employment history → POSITIVE / NEGATIVE employment tags ─────────
  if (employeeRecord) {
    if (employeeRecord.employmentStatus === "former") {
      history.isFormerEmployee = true;
      history.formerEmployeeNumber = employeeRecord.EmployeeNumber;
      history.formerRole = employeeRecord.JobRole;
      history.formerDepartment = employeeRecord.Department;
      history.formerExitDate = employeeRecord.exitDate || null;
      history.formerTenureYears = employeeRecord.YearsAtCompany ?? null;
      tags.add(employeeRecord.rehireEligible === false ? "rehire_ineligible" : "former_employee");
    } else if (employeeRecord.employmentStatus === "active") {
      history.isInternalCandidate = true;
      history.formerEmployeeNumber = employeeRecord.EmployeeNumber;
      history.formerRole = employeeRecord.JobRole;
      history.formerDepartment = employeeRecord.Department;
      tags.add("internal_candidate");
    }
  }

  // ── 2. Rejection history → NEGATIVE tag ────────────────────────────────
  const rejected = priorApps.filter((a) => a.status === "rejected");
  if (rejected.length) {
    history.wasPreviouslyRejected = true;
    history.previousRejectionCount = rejected.length;
    tags.add("previously_rejected");
  }

  // ── 3. Last applied (any job) + repeat-applicant flag ──────────────────
  if (priorApps.length) {
    const last = priorApps[0];
    history.lastAppliedAt = last.appliedAt;
    history.lastAppliedJobId = last.jobId;
    history.lastAppliedJobTitle = last.jobTitle;
    history.lastAppliedStatus = last.status;
    if (priorApps.some((a) => a.jobId === jobId)) tags.add("repeat_applicant");
  }

  history.tags = [...tags];
  return history;
}

/** Flat skill names out of a module-1 `/extract-skills` payload. */
export function flattenExtractedSkills(extraction) {
  if (!extraction) return [];
  const names = new Set();
  for (const s of extraction.skills || []) if (s?.name) names.add(s.name);
  for (const items of Object.values(extraction.categorized || {})) {
    for (const s of items || []) if (s?.name) names.add(s.name);
  }
  return [...names];
}

const normalizeSkill = (v = "") => String(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Same matching rule JobPostsOnly.jsx uses, so scores agree between the two. */
export function isSkillMatch(candidateSkill, requiredSkill) {
  const c = normalizeSkill(candidateSkill);
  const r = normalizeSkill(requiredSkill);
  if (!c || !r) return false;
  return c === r || c.includes(r) || r.includes(c);
}

/**
 * The heuristic fallback score, byte-identical to `scoreCandidate()` in
 * JobPostsOnly.jsx. Used only until a real module-1 ranking run overwrites it,
 * so the number a candidate shows never jumps when the DB takes over.
 */
export function heuristicScore(candidateSkills, requiredSkills) {
  const required = requiredSkills || [];
  if (!required.length) return { score: 0.5, matchedSkills: [], missingSkills: [], matchPct: 0 };

  const matchedSkills = (candidateSkills || []).filter((s) => required.some((r) => isSkillMatch(s, r)));
  const missingSkills = required.filter((r) => !(candidateSkills || []).some((s) => isSkillMatch(s, r)));
  const ratio = matchedSkills.length / required.length;
  return {
    score: Number(Math.min(0.98, Math.max(0.45, 0.45 + ratio * 0.55)).toFixed(2)),
    matchedSkills,
    missingSkills,
    matchPct: Math.round(ratio * 100),
  };
}

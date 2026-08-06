/**
 * ApplicantPortal — what a job seeker sees after signing in.
 *
 * Two things carry real product logic here:
 *   1. The re-apply freeze. The server is the authority (a 429 with
 *      `cooldown_active`), but the Apply button reflects it up front so nobody
 *      fills in a form only to be rejected at submit time.
 *   2. The CV upload. The file goes to GridFS and is immediately run through
 *      Module 1's `/read-file` + `/extract-skills`, so the applicant sees the
 *      skills the system actually parsed out of their document.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Star,
  UserRound,
  XCircle,
} from "lucide-react";
import Modal from "../../components/ui/Modal.jsx";
import Pill from "../../components/ui/Pill.jsx";
import CvViewer from "../../components/CvViewer.jsx";
import CvLibrary, { formatFileSize } from "./CvLibrary.jsx";
import UserMenu from "../layout/UserMenu.jsx";
import NotificationBell from "../notifications/NotificationBell.jsx";
import { cx } from "../../lib/cx.js";
import { api, ApiError } from "../../lib/api.js";
import { useSession } from "../../auth/SessionProvider.jsx";

const STATUS_STYLE = {
  submitted: { cls: "border-slate-200 bg-slate-100 text-slate-600", label: "Submitted" },
  under_review: { cls: "border-sky-200 bg-sky-50 text-sky-700", label: "Under review" },
  shortlisted: { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Shortlisted" },
  interview: { cls: "border-indigo-200 bg-indigo-50 text-indigo-700", label: "Interview" },
  offered: { cls: "border-violet-200 bg-violet-50 text-violet-700", label: "Offer" },
  hired: { cls: "border-emerald-300 bg-emerald-100 text-emerald-800", label: "Hired" },
  rejected: { cls: "border-rose-200 bg-rose-50 text-rose-700", label: "Not selected" },
  withdrawn: { cls: "border-slate-200 bg-slate-100 text-slate-500", label: "Withdrawn" },
};

function deadlinePassed(deadline) {
  const [y, m, d] = String(deadline).split("-").map(Number);
  if (!y || !m || !d) return false;
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59)).getTime() < Date.now();
}

function countdown(nextEligibleAt) {
  const ms = new Date(nextEligibleAt).getTime() - Date.now();
  if (ms <= 0) return null;
  const hours = Math.floor(ms / 3600_000);
  const minutes = Math.ceil((ms % 3600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function ApplicantPortal() {
  const { user, cvs: sessionCvs, refresh } = useSession();

  const [tab, setTab] = useState("jobs");
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [cvs, setCvs] = useState(sessionCvs || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [applyJob, setApplyJob] = useState(null);
  const [detail, setDetail] = useState(null);

  // Keep the library in step with whatever the session last reported.
  useEffect(() => {
    setCvs(sessionCvs || []);
  }, [sessionCvs]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsResult, mine, myCvs] = await Promise.all([
        api.jobs.list(),
        api.applications.mine(),
        api.myCvs.list().catch(() => ({ cvs: [] })),
      ]);
      setJobs(jobsResult.jobs || []);
      setApplications(mine.applications || []);
      setCvs(myCvs.cvs || []);
    } catch (err) {
      setError(err.message || "Could not load your portal.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? jobs.filter((j) => `${j.title} ${j.dept} ${j.location} ${(j.skills || []).join(" ")}`.toLowerCase().includes(q))
      : jobs;
    // Open roles first, then by nearest deadline.
    return [...base].sort((a, b) => {
      const aClosed = deadlinePassed(a.deadline);
      const bClosed = deadlinePassed(b.deadline);
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return new Date(b.deadline) - new Date(a.deadline);
    });
  }, [jobs, search]);

  const activeCount = applications.filter((a) => !["rejected", "withdrawn"].includes(a.status)).length;

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-indigo-200/45 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 h-96 w-96 rounded-full bg-sky-200/45 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl p-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 font-black text-white">
                HR
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight text-slate-900">
                  Hi {user?.firstName || user?.email?.split("@")[0]}
                </div>
                <div className="text-sm text-slate-500">
                  {activeCount ? `${activeCount} active application${activeCount > 1 ? "s" : ""}` : "Find your next role"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </motion.div>

        {/* Tabs */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            {[
              { key: "jobs", label: "Open roles", count: jobs.filter((j) => !deadlinePassed(j.deadline)).length },
              { key: "applications", label: "My applications", count: applications.length },
              { key: "profile", label: "My profile", count: cvs.length },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cx(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition",
                  tab === t.key ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                {t.label}
                <span
                  className={cx(
                    "rounded-full px-1.5 text-[10px] font-bold",
                    tab === t.key ? "bg-white/20" : "bg-slate-100 text-slate-600"
                  )}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {tab === "jobs" && (
            <div className="flex w-full items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:w-80">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search roles, skills, locations…"
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-3xl border border-rose-200 bg-rose-50 p-4">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div className="flex-1 text-sm text-rose-700">{error}</div>
            <button onClick={load} className="text-xs font-semibold text-rose-700 underline">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="mt-4 flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-16 text-sm text-slate-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            Loading…
          </div>
        ) : tab === "jobs" ? (
          <div className="mt-4 space-y-3">
            {filteredJobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No open roles right now"
                body="No positions are open at the moment."
              />
            ) : (
              filteredJobs.map((job) => (
                <JobCard key={job.id} job={job} onApply={() => setApplyJob(job)} />
              ))
            )}
          </div>
        ) : tab === "applications" ? (
          <div className="mt-4 space-y-3">
            {applications.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="You haven't applied to anything yet"
                body="Open roles are listed under the first tab."
              />
            ) : (
              applications.map((application) => (
                <ApplicationCard
                  key={application.applicationId}
                  application={application}
                  onOpen={() => setDetail(application)}
                />
              ))
            )}
          </div>
        ) : (
          <ProfileTab user={user} cvs={cvs} onCvsChange={setCvs} onSaved={refresh} />
        )}
      </div>

      <ApplyModal
        job={applyJob}
        onClose={() => setApplyJob(null)}
        onSubmitted={async () => {
          setApplyJob(null);
          setTab("applications");
          await load();
        }}
        user={user}
        cvs={cvs}
        onCvsChange={setCvs}
        onEditProfile={() => {
          setApplyJob(null);
          setTab("profile");
        }}
      />

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail?.jobTitle || "Application"}
        subtitle={
          detail ? `Applied ${new Date(detail.appliedAt).toLocaleDateString(undefined, { dateStyle: "long" })}` : ""
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cx(
                  "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                  STATUS_STYLE[detail.status]?.cls || STATUS_STYLE.submitted.cls
                )}
              >
                {STATUS_STYLE[detail.status]?.label || detail.status}
              </span>
              <Pill className="border border-slate-200 bg-slate-50 text-slate-600">
                {detail.skillCount} skills extracted
              </Pill>
              {detail.matchPct ? (
                <Pill className="border border-indigo-200 bg-indigo-50 text-indigo-700">
                  {detail.matchPct}% skill match
                </Pill>
              ) : null}
            </div>

            {detail.skills?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Skills we found in your CV
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {detail.skills.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs text-slate-700"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {detail.statusHistory?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">Timeline</div>
                <div className="mt-3 space-y-2">
                  {detail.statusHistory.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-400" />
                      <span className="font-semibold capitalize text-slate-800">{h.status.replace(/_/g, " ")}</span>
                      <span className="text-slate-400">{new Date(h.at).toLocaleDateString()}</span>
                      {h.note ? <span className="truncate text-slate-500">— {h.note}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <CvViewer
              fileId={detail.cvFileId}
              filename={detail.cvOriginalName}
              mimeType={detail.cvMimeType}
              height="50vh"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
      <Icon className="mx-auto h-10 w-10 text-slate-300" />
      <div className="mt-3 text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{body}</div>
    </div>
  );
}

function JobCard({ job, onApply }) {
  // Closed either because the deadline passed, or because an admin stopped the
  // posting. The server refuses both, so the button must not offer either.
  const stopped = !!job.status && job.status !== "open";
  const closed = stopped || deadlinePassed(job.deadline);
  const applied = job.myApplication;
  const waiting = applied?.nextEligibleAt ? countdown(applied.nextEligibleAt) : null;

  return (
    <div
      className={cx(
        "rounded-3xl border bg-white p-5 shadow-sm transition",
        closed ? "border-slate-200 opacity-70" : "border-slate-200 hover:border-indigo-200 hover:shadow-md"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-bold tracking-tight text-slate-900">{job.title}</div>
            <Pill
              className={cx(
                "border",
                closed
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              )}
            >
              {closed ? <XCircle className="mr-1 h-3.5 w-3.5" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
              {stopped ? "No longer accepting" : closed ? "Closed" : "Open"}
            </Pill>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5" />
              {job.dept}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Closes {job.deadline}
            </span>
            {job.experienceLevel ? <span>{job.experienceLevel}</span> : null}
          </div>

          {job.summary ? (
            <div className="mt-3 text-sm leading-6 text-slate-600">{job.summary}</div>
          ) : null}

          {job.skills?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-700"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0">
          {closed ? (
            <button
              disabled
              title={stopped ? "The employer stopped accepting applications for this role." : "The deadline has passed."}
              className="cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
            >
              Closed
            </button>
          ) : waiting ? (
            <div className="text-right">
              <button
                disabled
                title={`You can re-apply in ${waiting}`}
                className="inline-flex cursor-not-allowed items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700"
              >
                <Clock className="h-4 w-4" />
                Re-apply in {waiting}
              </button>
              <div className="mt-1 text-[11px] text-slate-400">
                Applied {new Date(applied.appliedAt).toLocaleDateString()}
              </div>
            </div>
          ) : applied ? (
            <div className="text-right">
              <button
                onClick={onApply}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Apply again
                <ArrowRight className="h-4 w-4" />
              </button>
              <div className="mt-1 text-[11px] text-slate-400">
                Last applied {new Date(applied.appliedAt).toLocaleDateString()}
              </div>
            </div>
          ) : (
            <button
              onClick={onApply}
              className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Apply
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ApplicationCard({ application, onOpen }) {
  const status = STATUS_STYLE[application.status] || STATUS_STYLE.submitted;
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-bold text-slate-900">{application.jobTitle}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              Applied {new Date(application.appliedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
            </span>
            {application.cvOriginalName ? (
              <span className="inline-flex items-center gap-1 truncate">
                <FileText className="h-3.5 w-3.5" />
                {application.cvOriginalName}
              </span>
            ) : null}
            {application.skillCount ? <span>{application.skillCount} skills</span> : null}
          </div>
        </div>
        <span className={cx("shrink-0 rounded-full border px-3 py-1 text-xs font-bold", status.cls)}>
          {status.label}
        </span>
      </div>
    </button>
  );
}

/**
 * My profile — the same details collected at sign-up, editable later.
 *
 * Nothing here is asked for again at apply time; the application copies these
 * values off the user document on the server.
 */
function ProfileTab({ user, cvs, onCvsChange, onSaved }) {
  const [form, setForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    phone: user?.phone || "",
    location: user?.location || "",
    headline: user?.headline || "",
    yearsExperience: user?.yearsExperience ?? "",
    linkedinUrl: user?.linkedinUrl || "",
    portfolioUrl: user?.portfolioUrl || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  };

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.updateMe({
        ...form,
        yearsExperience: form.yearsExperience === "" ? null : Number(form.yearsExperience),
      });
      await onSaved?.();
      setSaved(true);
    } catch (err) {
      setError(err.message || "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <UserRound className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Your details</div>
            <div className="text-xs text-slate-500">Sent with every application.</div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="First name" value={form.firstName} onChange={set("firstName")} />
          <Field label="Last name" value={form.lastName} onChange={set("lastName")} />
          <Field label="Phone" value={form.phone} onChange={set("phone")} />
          <Field label="Location" value={form.location} onChange={set("location")} />
          <Field label="Current title" value={form.headline} onChange={set("headline")} />
          <Field
            label="Years of experience"
            type="number"
            value={form.yearsExperience}
            onChange={set("yearsExperience")}
          />
          <Field label="LinkedIn" value={form.linkedinUrl} onChange={set("linkedinUrl")} />
          <Field label="Portfolio / GitHub" value={form.portfolioUrl} onChange={set("portfolioUrl")} />
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
            <div className="text-sm text-rose-700">{error}</div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Saved
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400">{user?.email}</span>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">Your CVs</div>
            <div className="text-xs text-slate-500">
              Choose which one to send when you apply.
            </div>
          </div>
        </div>
        <div className="mt-5">
          <CvLibrary cvs={cvs} onChange={onCvsChange} />
        </div>
      </div>
    </div>
  );
}

/**
 * The apply form.
 *
 * All it asks for now is which stored CV to send and an optional cover letter.
 * Name, phone, title and the rest were captured at sign-up and are copied off
 * the user document by the server, so they are shown here read-only rather
 * than typed again. Anyone who arrives without a CV can still add one inline.
 */
function ApplyModal({ job, onClose, onSubmitted, user, cvs = [], onCvsChange, onEditProfile }) {
  const [eligibility, setEligibility] = useState(null);
  const [checking, setChecking] = useState(false);
  const [selectedCvId, setSelectedCvId] = useState(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!job) {
      setEligibility(null);
      setError(null);
      setResult(null);
      setCoverLetter("");
      return;
    }
    // Default to the CV marked default, else the most recent one.
    setSelectedCvId(cvs.find((c) => c.isDefault)?.fileId || cvs[0]?.fileId || null);
    setChecking(true);
    api.jobs
      .eligibility(job.id)
      .then(setEligibility)
      .catch(() => setEligibility(null))
      .finally(() => setChecking(false));
  }, [job]); // eslint-disable-line react-hooks/exhaustive-deps

  // A CV added from inside this modal becomes the selected one.
  function handleCvsChange(next) {
    onCvsChange?.(next);
    const known = new Set(cvs.map((c) => c.fileId));
    const added = next.find((c) => !known.has(c.fileId));
    if (added) setSelectedCvId(added.fileId);
    else if (!next.some((c) => c.fileId === selectedCvId)) setSelectedCvId(next[0]?.fileId || null);
  }

  async function submit() {
    if (!selectedCvId) {
      setError("Choose which CV to send.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("jobId", job.id);
      formData.append("cvFileId", selectedCvId);
      if (coverLetter.trim()) formData.append("coverLetter", coverLetter.trim());
      const data = await api.applications.submit(formData);
      setResult(data);
    } catch (err) {
      if (err instanceof ApiError && err.code === "cooldown_active") {
        setError(err.message);
        setEligibility((prev) => ({ ...(prev || {}), allowed: false, ...err.details }));
      } else {
        setError(err.message || "Could not submit your application.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const blocked = eligibility && !eligibility.allowed;
  const waiting = eligibility?.nextEligibleAt ? countdown(eligibility.nextEligibleAt) : null;

  return (
    <Modal
      open={!!job}
      onClose={onClose}
      size="md"
      title={result ? "Application submitted" : `Apply — ${job?.title || ""}`}
      subtitle={result ? "" : job ? `${job.dept} · ${job.location} · closes ${job.deadline}` : ""}
      footer={
        result ? (
          <button
            onClick={onSubmitted}
            className="w-full rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            View my applications
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={submitting || blocked || checking || !selectedCvId}
              className="flex-1 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting…
                </span>
              ) : (
                "Submit application"
              )}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">You're in the running</div>
            <div className="mt-1 text-sm text-slate-600">
              Application <span className="font-mono font-semibold">{result.application.applicationId}</span> for{" "}
              {result.application.jobTitle}.
            </div>
          </div>

          {result.application.skills?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                {result.application.skills.length} skills extracted from your CV
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {result.application.skills.slice(0, 20).map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-700"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.warning && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-800">
              {result.warning}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-left text-xs text-slate-500">
            You can apply to this role again after{" "}
            <span className="font-semibold text-slate-700">
              {new Date(result.application.nextEligibleAt).toLocaleString()}
            </span>
            .
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {checking && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Checking eligibility…
            </div>
          )}

          {blocked && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <div className="text-sm font-bold text-amber-800">
                  {waiting ? `You can re-apply in ${waiting}` : "You can't apply right now"}
                </div>
                <div className="mt-1 text-xs leading-5 text-amber-700">{eligibility.reason}</div>
                {eligibility.cooldownHours ? (
                  <div className="mt-1 text-[11px] text-amber-600">
                    Cooldown window: {eligibility.cooldownHours} hour
                    {eligibility.cooldownHours > 1 ? "s" : ""} per job post.
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {error && !blocked && (
            <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div className="text-sm text-rose-700">{error}</div>
            </div>
          )}

          {/* Pick a stored CV */}
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Which CV to send *</div>
              {cvs.length > 0 && <div className="text-[11px] text-slate-400">{cvs.length} saved</div>}
            </div>

            {cvs.length === 0 ? (
              <div className="mt-2 space-y-3">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  No CVs saved yet. Anything you add here is kept in your profile.
                </div>
                <CvLibrary cvs={cvs} onChange={handleCvsChange} compact />
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {cvs.map((cv) => {
                  const active = cv.fileId === selectedCvId;
                  return (
                    <button
                      key={cv.fileId}
                      type="button"
                      disabled={blocked}
                      onClick={() => {
                        setSelectedCvId(cv.fileId);
                        setError(null);
                      }}
                      className={cx(
                        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition disabled:opacity-50",
                        active
                          ? "border-indigo-300 bg-indigo-50/70 ring-2 ring-indigo-200"
                          : "border-slate-200 bg-white hover:bg-slate-50"
                      )}
                    >
                      <div
                        className={cx(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                          active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                        )}
                      >
                        {active ? <CheckCircle2 className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-semibold text-slate-900">{cv.originalName}</span>
                          {cv.isDefault && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Default
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          {formatFileSize(cv.sizeBytes)}
                          {cv.extractionStatus === "done" ? ` · ${cv.skillCount} skills already read` : " · skills not read yet"}
                        </div>
                      </div>
                    </button>
                  );
                })}

                <div className="pt-1">
                  <CvLibrary cvs={cvs} onChange={handleCvsChange} uploadOnly />
                </div>
              </div>
            )}
          </div>

          {/* Everything else came from the profile — shown, not re-asked */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Applying as</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-900">
                  {user?.fullName || user?.email}
                </div>
                <div className="mt-0.5 text-[11px] leading-5 text-slate-500">
                  {[
                    user?.email,
                    user?.phone,
                    user?.headline,
                    user?.location,
                    user?.yearsExperience != null ? `${user.yearsExperience} yrs experience` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                type="button"
                onClick={onEditProfile}
                className="shrink-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Edit
              </button>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Cover letter <span className="normal-case text-slate-400">(optional, specific to this role)</span>
            </div>
            <textarea
              rows={4}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              placeholder="Why are you a good fit for this role?"
              className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-300"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text" }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-300"
      />
    </label>
  );
}

/**
 * NewJobModal — the admin "open a job posting" form.
 *
 * This is what the "New job posting" panel opens — it sits inside the Job
 * Recruitment screen, directly above "Latest Job Posts" (it used to be a
 * "+ New" button in the header). This form is what creates a `Job` document,
 * the thing applicants browse and apply to; fair screening then runs against
 * the CVs those applicants submit.
 *
 * Required skills are NOT typed in by hand. As soon as there's enough
 * description text (typed, pasted, or pulled from an uploaded JD file), it is
 * sent to Module 1's `/extract-text` skill extractor — the exact same
 * endpoint and response shape JobPostsOnly already uses for the JD skills in
 * its screening results — and the result is shown as removable chips. The
 * short summary is no longer typed either: it's derived from the description
 * text at publish time.
 */
import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Upload, X } from "lucide-react";
import Modal from "../../components/ui/Modal.jsx";
import { api, ApiError } from "../../lib/api.js";

const MODULE1_API_URL = import.meta.env.VITE_MODULE1_API_URL || "https://ijsasif-module-1-skill-extractor.hf.space";

function titleFromFilename(filename) {
  const noExt = filename.replace(/\.[^/.]+$/, "");
  const noPrefix = noExt.replace(/^(\d+|jd)[_\-\s]+/i, "");
  const noSuffix = noPrefix.replace(/[_\-\s]+(jd|position|role|description)$/i, "");
  return noSuffix.replace(/[_\-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function defaultDeadline(daysAhead = 30) {
  return new Date(Date.now() + daysAhead * 864e5).toISOString().slice(0, 10);
}

/** Same flattening rule the server applies to a Module 1 skills payload. */
function flattenSkills(payload) {
  if (!payload) return [];
  const names = new Set();
  for (const s of payload.skills || []) if (s?.name) names.add(s.name);
  for (const items of Object.values(payload.categorized || {})) {
    for (const s of items || []) if (s?.name) names.add(s.name);
  }
  return [...names];
}

/** First ~200 characters, cut at a word boundary — no ML call needed for this. */
function autoSummary(description) {
  const clean = description.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= 200) return clean;
  const cut = clean.slice(0, 200);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 120 ? lastSpace : 200)}…`;
}

const EMPTY_FORM = {
  title: "",
  dept: "",
  location: "Remote",
  deadline: defaultDeadline(),
  employmentType: "Full-time",
  experienceLevel: "Mid-Level",
  openings: 1,
  salaryMin: "",
  salaryMax: "",
  description: "",
};

export default function NewJobModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [jdFile, setJdFile] = useState(null);
  const [jdExtracting, setJdExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // ── ML skill extraction — driven entirely by the description text ────────
  const [skills, setSkills] = useState([]);
  const [skillsExtracting, setSkillsExtracting] = useState(false);
  const [skillsError, setSkillsError] = useState(false);

  const fileInputRef = useRef(null);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetAll() {
    setForm(EMPTY_FORM);
    setJdFile(null);
    setSkills([]);
    setSkillsError(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    resetAll();
    onClose();
  }

  // Auto-extract skills from the description, debounced, whenever it changes —
  // no button to press, no box to fill in by hand.
  useEffect(() => {
    const text = form.description.trim();
    if (text.length < 30) {
      setSkills([]);
      setSkillsError(false);
      return undefined;
    }
    let cancelled = false;
    setSkillsExtracting(true);
    setSkillsError(false);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${MODULE1_API_URL.replace(/\/$/, "")}/extract-text`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!cancelled) {
          if (res.ok) setSkills(flattenSkills(await res.json()));
          else setSkillsError(true);
        }
      } catch {
        if (!cancelled) setSkillsError(true);
      } finally {
        if (!cancelled) setSkillsExtracting(false);
      }
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.description]);

  async function handleUploadJd(file) {
    if (!file) return;
    setJdFile(file);
    setJdExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${MODULE1_API_URL.replace(/\/$/, "")}/read-file`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.text?.trim()) {
          set("description", data.text.trim()); // triggers the skill-extraction effect above
          if (!form.title.trim()) set("title", titleFromFilename(file.name));
        }
      }
    } catch {
      // Best-effort — the admin can still paste the description manually.
    } finally {
      setJdExtracting(false);
    }
  }

  const canSubmit = form.title.trim() && form.dept.trim() && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        dept: form.dept.trim(),
        location: form.location.trim() || "Remote",
        deadline: form.deadline,
        employmentType: form.employmentType,
        experienceLevel: form.experienceLevel,
        openings: Number(form.openings) || 1,
        description: form.description.trim(),
        summary: autoSummary(form.description),
        skills,
      };
      if (form.salaryMin) payload.salaryMin = Number(form.salaryMin);
      if (form.salaryMax) payload.salaryMax = Number(form.salaryMax);

      const data = await api.jobs.create(payload);
      resetAll();
      onCreated?.(data.job);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message || "Could not create this job post.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="lg"
      title="New job posting"
      subtitle="This publishes immediately — applicants will see it on their Open roles page."
      footer={
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            disabled={submitting}
            className="rounded-tile border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm font-semibold text-mist-200 hover:bg-ink-750 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 rounded-tile bg-brand px-4 py-2.5 text-sm font-semibold text-paper hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <span className="inline-flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Publishing…
              </span>
            ) : (
              "Publish job posting"
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-tile border border-risk/35 bg-risk/12 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
            <div className="text-sm text-risk">{error}</div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Job title *" value={form.title} onChange={(v) => set("title", v)} />
          <Field label="Department *" value={form.dept} onChange={(v) => set("dept", v)} />
          <Field label="Location" value={form.location} onChange={(v) => set("location", v)} />
          <Field label="Application deadline" type="date" value={form.deadline} onChange={(v) => set("deadline", v)} />

          <Select
            label="Employment type"
            value={form.employmentType}
            onChange={(v) => set("employmentType", v)}
            options={["Full-time", "Part-time", "Contract", "Internship"]}
          />
          <Select
            label="Experience level"
            value={form.experienceLevel}
            onChange={(v) => set("experienceLevel", v)}
            options={["Intern", "Junior", "Mid-Level", "Senior", "Lead"]}
          />
          <Field label="Openings" type="number" value={form.openings} onChange={(v) => set("openings", v)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Salary min" type="number" value={form.salaryMin} onChange={(v) => set("salaryMin", v)} />
            <Field label="Salary max" type="number" value={form.salaryMax} onChange={(v) => set("salaryMax", v)} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-mist-500">
              Full job description
            </span>
            <div className="flex items-center gap-2">
              {jdExtracting && (
                <span className="inline-flex items-center gap-1.5 text-xs text-mist-500">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Reading file…
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                aria-label="Upload a job description file"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (file) handleUploadJd(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-tile border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-xs font-semibold text-mist-200 hover:bg-ink-750"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                Upload JD
              </button>
            </div>
          </div>

          {jdFile && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-tile border border-ok/35 bg-ok/12 px-3 py-2 text-xs text-ok">
              <span className="inline-flex items-center gap-1.5 truncate">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{jdFile.name}</span>
              </span>
              <button
                type="button"
                onClick={() => setJdFile(null)}
                className="shrink-0 rounded-lg p-1 text-ok hover:bg-ok/12"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          <textarea
            rows={8}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Paste the full job description here, or upload a JD file above — skills are extracted automatically as you type."
            className="mt-2 w-full resize-none rounded-tile border border-ink-600 bg-ink-800 px-3 py-2.5 text-sm leading-6 text-paper outline-none transition placeholder:text-mist-600 focus:border-brand/35"
          />

          {/* Auto-extracted skills — no manual typing, no separate box */}
          <div className="mt-2 rounded-tile border border-ink-600 bg-ink-850 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-mist-500">
                <Sparkles className="h-3 w-3 text-brand-hi" aria-hidden="true" />
                Required skills — extracted by Module 1
              </span>
              {skillsExtracting && (
                <span className="inline-flex items-center gap-1.5 text-[11px] text-mist-600">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> Extracting…
                </span>
              )}
            </div>

            {!skillsExtracting && skillsError && (
              <div className="mt-2 text-[11px] text-raw">
                Skill extractor is unreachable right now. The job can still be published — skills will be
                empty until you edit the description again while it's back up.
              </div>
            )}

            {!skillsExtracting && !skillsError && skills.length === 0 && (
              <div className="mt-2 text-[11px] text-mist-600">
                {form.description.trim().length < 30
                  ? "Write or upload a description above — skills appear here automatically."
                  : "No skills detected in this description."}
              </div>
            )}

            {skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand/35 bg-brand/12 px-2.5 py-1 text-xs font-medium text-brand-hi"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => setSkills((list) => list.filter((s) => s !== skill))}
                      className="text-brand-hi hover:text-brand-hi"
                      title="Remove this skill"
                    >
                      <X className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-tile border border-brand/25 bg-brand/8 px-4 py-3 text-xs leading-5 text-mist-200">
          Publishing sets the post to <span className="font-semibold">Open</span> and visible to every applicant
          immediately. The card summary is generated from your description automatically.
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-mist-500">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-10 w-full rounded-tile border border-ink-600 bg-ink-800 px-3 text-sm text-paper outline-none transition placeholder:text-mist-600 focus:border-brand/35"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-mist-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-10 w-full rounded-tile border border-ink-600 bg-ink-800 px-3 text-sm text-paper outline-none transition focus:border-brand/35"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Onboarding — the one-time step that runs straight after sign-up.
 *
 * Clerk owns the sign-up form itself (email + password) and there is no way to
 * put a file picker inside it, so everything else an application needs is
 * collected here instead: the profile fields once, and as many CVs as the
 * person keeps. Both are written to MongoDB as they are entered — the profile
 * PATCHes when you move between steps, each CV uploads and is parsed by
 * module 1 the moment it is picked — so nothing is lost if the tab closes, and
 * applying to a job later is just choosing which CV to send.
 *
 * `users.onboardedAt` is what App.jsx routes on. Skipping still stamps it; the
 * apply flow can upload a CV inline for anyone who arrives without one.
 */
import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, FileText, Loader2, UserRound } from "lucide-react";
import CvLibrary from "./CvLibrary.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";
import { useSession } from "../../auth/SessionProvider.jsx";

const STEPS = [
  { key: "profile", label: "About you", icon: UserRound },
  { key: "cvs", label: "Your CVs", icon: FileText },
];

export default function Onboarding() {
  const { user, cvs: sessionCvs, refresh, signOut } = useSession();

  const [step, setStep] = useState(0);
  const [cvs, setCvs] = useState(sessionCvs || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
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

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const nameMissing = !form.firstName.trim();

  /** Writes the profile as it stands. Called on "Next" and on finish. */
  async function saveProfile() {
    await api.updateMe({
      ...form,
      yearsExperience: form.yearsExperience === "" ? null : Number(form.yearsExperience),
    });
  }

  async function goToCvs() {
    if (nameMissing) {
      setError("Please tell us your first name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveProfile();
      setStep(1);
    } catch (err) {
      setError(err.message || "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await api.finishOnboarding({
        ...form,
        yearsExperience: form.yearsExperience === "" ? null : Number(form.yearsExperience),
      });
      await refresh();
    } catch (err) {
      setError(err.message || "Could not finish setting up your account.");
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-indigo-200/45 blur-3xl" />
        <div className="absolute -bottom-28 -right-28 h-96 w-96 rounded-full bg-sky-200/45 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-2xl p-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xl font-bold tracking-tight text-slate-900">Set up your account</div>
              <div className="mt-1 text-sm text-slate-500">
                Your details and CVs, saved once and reused on every application.
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 font-black text-white">
              HR
            </div>
          </div>

          {/* Progress */}
          <div className="mt-6 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <React.Fragment key={s.key}>
                  <div
                    className={cx(
                      "inline-flex items-center gap-2 rounded-2xl px-3 py-1.5 text-xs font-semibold transition",
                      active
                        ? "bg-indigo-600 text-white"
                        : done
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && <div className="h-px flex-1 bg-slate-200" />}
                </React.Fragment>
              );
            })}
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <div className="text-sm text-rose-700">{error}</div>
            </div>
          )}

          {step === 0 ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="First name *" value={form.firstName} onChange={set("firstName")} />
                <Field label="Last name" value={form.lastName} onChange={set("lastName")} />
                <Field label="Phone" value={form.phone} onChange={set("phone")} />
                <Field label="Location" value={form.location} onChange={set("location")} placeholder="Dhaka, BD" />
                <Field
                  label="Current title"
                  value={form.headline}
                  onChange={set("headline")}
                  placeholder="Data Analyst"
                />
                <Field
                  label="Years of experience"
                  type="number"
                  value={form.yearsExperience}
                  onChange={set("yearsExperience")}
                />
                <Field label="LinkedIn" value={form.linkedinUrl} onChange={set("linkedinUrl")} />
                <Field label="Portfolio / GitHub" value={form.portfolioUrl} onChange={set("portfolioUrl")} />
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Signed in as <span className="font-semibold text-slate-700">{user?.email}</span>. First name required.
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={goToCvs}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Next
                  {!saving && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div>
                <div className="text-sm font-bold text-slate-900">Add your CVs</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  Skills are read from each CV on upload. You choose which one to send when you apply.
                </div>
              </div>

              <CvLibrary cvs={cvs} onChange={setCvs} />

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(0)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <div className="flex items-center gap-3">
                  {cvs.length === 0 && (
                    <button
                      type="button"
                      onClick={finish}
                      disabled={saving}
                      className="text-xs font-semibold text-slate-400 hover:text-slate-600 disabled:opacity-60"
                    >
                      Skip for now
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={finish}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {cvs.length ? "Browse open roles" : "Continue without a CV"}
                    {!saving && <ArrowRight className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-indigo-300"
      />
    </label>
  );
}

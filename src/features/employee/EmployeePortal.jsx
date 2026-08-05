/**
 * EmployeePortal — what a current employee sees.
 *
 * Deliberately NOT a smaller copy of the admin console. An employee sees their
 * own record and their own growth plan, and never anyone else's attrition
 * probability — the server enforces that too (`/api/employees` filters to their
 * own EmployeeNumber), so this is defence in depth rather than a UI-only rule.
 *
 * Their own attrition number is shown as a retention/engagement reading rather
 * than a "chance you quit" score, because telling someone the company thinks
 * they are 78% likely to leave is not useful feedback — the SHAP drivers and
 * the recommended actions are.
 */
import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  MapPin,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Pill from "../../components/ui/Pill.jsx";
import SoftTag from "../../components/ui/SoftTag.jsx";
import UserMenu from "../layout/UserMenu.jsx";
import NotificationBell from "../notifications/NotificationBell.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";
import { useSession } from "../../auth/SessionProvider.jsx";

export default function EmployeePortal() {
  const { user, employee: sessionEmployee, switchRole, roles } = useSession();

  const [employee, setEmployee] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [paths, setPaths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!user?.employeeNumber) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [record, learningPaths] = await Promise.all([
        api.employees.get(user.employeeNumber),
        api.upskilling.paths({ mine: "true", limit: 10 }).catch(() => ({ paths: [] })),
      ]);
      setEmployee(record.employee);
      setAnalysis(record.analysis);
      setPaths(learningPaths.paths || []);
    } catch (err) {
      setError(err.message || "Could not load your record.");
    } finally {
      setLoading(false);
    }
  }, [user?.employeeNumber]);

  useEffect(() => {
    load();
  }, [load]);

  const profile = employee || sessionEmployee;

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-28 -left-28 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
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
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 font-black text-white">
                {profile?.initials || "HR"}
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight text-slate-900">
                  {profile?.name || user?.fullName || "Your workspace"}
                </div>
                <div className="text-sm text-slate-500">
                  {profile?.JobRole ? `${profile.JobRole} · ${profile.Department}` : "Current employee"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </motion.div>

        {/* Applicants-too nudge — the room-cleaner-to-ML-engineer path */}
        {roles.includes("applicant") && (
          <button
            onClick={() => switchRole("applicant")}
            className="mt-4 flex w-full items-center justify-between gap-3 rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-sky-50 p-4 text-left transition hover:border-indigo-300"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm">
                <Briefcase className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Looking for an internal move?</div>
                <div className="text-xs text-slate-600">
                  Switch to the applicant view to browse open roles — same account, and HR sees you tagged as an
                  internal candidate.
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-2xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white">
              Browse roles
            </span>
          </button>
        )}

        {!user?.employeeNumber && !loading && (
          <div className="mt-4 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 p-5">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <div className="text-sm font-bold text-amber-800">No employee record linked yet</div>
              <div className="mt-1 text-xs leading-5 text-amber-700">
                An admin needs to link your account to an employee record before your retention insight and
                learning paths appear. Ask them to open <span className="font-semibold">People &amp; Roles</span>,
                find your email and link an employee number.
              </div>
            </div>
          </div>
        )}

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
            <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
            Loading your record…
          </div>
        ) : profile ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            {/* Profile */}
            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your details</div>
                <div className="mt-4 space-y-3">
                  <Row icon={Briefcase} label="Role" value={profile.JobRole} />
                  <Row icon={Award} label="Department" value={profile.Department} />
                  <Row icon={Calendar} label="Joined" value={profile.joined} />
                  <Row icon={Clock} label="Tenure" value={profile.YearsAtCompany != null ? `${profile.YearsAtCompany} years` : "—"} />
                  <Row icon={MapPin} label="Location" value={`${profile.location || "—"} · ${profile.workMode || ""}`} />
                  <Row
                    icon={DollarSign}
                    label="Monthly income"
                    value={profile.MonthlyIncome ? `$${profile.MonthlyIncome.toLocaleString()}` : "—"}
                  />
                  <Row icon={Award} label="Last promotion" value={profile.lastPromotion} />
                </div>
              </div>

              {profile.skills?.length > 0 && (
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your skills</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {profile.skills.map((s) => (
                      <SoftTag key={s}>{s}</SoftTag>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Insight + learning */}
            <div className="space-y-4">
              {analysis ? (
                <>
                  {/* Framed as engagement, not as "you're about to quit" */}
                  <div
                    className={cx(
                      "rounded-3xl p-5 text-white shadow-sm",
                      analysis.risk_tier === "Low"
                        ? "bg-emerald-600"
                        : analysis.risk_tier === "Medium"
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    )}
                  >
                    <div className="text-sm opacity-90">Your engagement reading</div>
                    <div className="mt-1 text-4xl font-extrabold tracking-tight">
                      {(100 - analysis.attrition_pct).toFixed(0)}%
                    </div>
                    <div className="mt-1 text-sm font-medium text-white/80">
                      {analysis.risk_tier === "Low"
                        ? "You look well settled — nice."
                        : analysis.risk_tier === "Medium"
                          ? "A few things could be better."
                          : "Worth a conversation with your manager."}
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/30">
                      <div
                        className="h-full rounded-full bg-white transition-all duration-700"
                        style={{ width: `${Math.min(100 - analysis.attrition_pct, 100)}%` }}
                      />
                    </div>
                  </div>

                  {analysis.shap_top5?.length > 0 && (
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-base font-bold text-slate-900">What's shaping this</div>
                      <div className="mb-4 mt-1 text-xs text-slate-500">
                        The factors the model weighs most for someone in your situation.
                      </div>
                      <div className="space-y-2">
                        {analysis.shap_top5.map((item) => {
                          const isRisk = item.direction === "risk";
                          return (
                            <div
                              key={item.rank}
                              className={cx(
                                "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                                isRisk ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-900">
                                  {item.feature_label}
                                </div>
                                <div className="text-xs text-slate-500">Currently: {item.raw_value}</div>
                              </div>
                              <div
                                className={cx(
                                  "flex shrink-0 items-center gap-1 text-xs font-bold",
                                  isRisk ? "text-amber-700" : "text-emerald-700"
                                )}
                              >
                                {isRisk ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                                {isRisk ? "Watch" : "Strength"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {analysis.dice_plans?.length > 0 && (
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="text-base font-bold text-slate-900">Suggested conversations</div>
                      <div className="mb-4 mt-1 text-xs text-slate-500">
                        Changes the model associates with better retention — useful talking points for your next
                        1:1.
                      </div>
                      <div className="space-y-2">
                        {analysis.dice_plans.slice(0, 4).map((plan, i) => (
                          <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-sm font-medium text-slate-800">{plan.intervention_label}</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {plan.feature_label}: {plan.current_value} → {plan.suggested_value}
                            </div>
                            {plan.applied && (
                              <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Already actioned by HR
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                  <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
                  <div className="mt-3 text-sm font-semibold text-slate-700">No insight generated yet</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Your retention analysis appears once HR runs it for your record.
                  </div>
                </div>
              )}

              {/* Learning paths */}
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-indigo-500" />
                    <div className="text-base font-bold text-slate-900">Your learning paths</div>
                  </div>
                  <Pill className="border border-slate-200 bg-slate-100 text-slate-700">{paths.length}</Pill>
                </div>

                {paths.length === 0 ? (
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                    Nothing assigned yet. HR can generate a path for a role you're aiming at.
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {paths.map((path) => (
                      <div key={path.pathId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900">
                              {path.targetJobTitle || "Custom target role"}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500">
                              {path.nCourses} courses · {path.pathTotalHours}h · ${path.pathTotalCostUsd}
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                            {path.jobReadiness}% ready
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                            style={{ width: `${Math.min(path.jobReadiness, 100)}%` }}
                          />
                        </div>
                        {path.topGaps?.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {path.topGaps.slice(0, 6).map((gap) => (
                              <span
                                key={gap}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                              >
                                {gap}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="truncate text-right text-sm font-semibold text-slate-900">{value || "—"}</div>
    </div>
  );
}

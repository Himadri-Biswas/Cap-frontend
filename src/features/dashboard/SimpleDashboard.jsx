import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  FileText,
  Loader2,
  TrendingDown,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import Pill from "../../components/ui/Pill.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";

/**
 * Every number here is now a live aggregate from MongoDB. The hard-coded demo
 * figures (735 employees, 97% attendance, a fixed 68/20/12 risk split) are
 * gone — the layout is the same, the data is real.
 */
function SimpleDashboard({ jobs = [], onNavigate }) {
  const [data, setData] = useState(null);
  const [topRisk, setTopRisk] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [dashboard, risk] = await Promise.all([
          api.dashboard(),
          api.attrition.topRisk(5).catch(() => ({ employees: [] })),
        ]);
        if (cancelled) return;
        setData(dashboard);
        setTopRisk(risk.employees || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load dashboard data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = [
    {
      label: "Total Employees",
      value: data?.stats.totalEmployees ?? "—",
      tone: "blue",
      icon: Users,
      hint: data ? `${data.stats.formerEmployees} former` : "",
      view: "employees",
    },
    {
      label: "Open Positions",
      value: data?.stats.openPositions ?? "—",
      tone: "purple",
      icon: BriefcaseBusiness,
      hint: data ? `${data.stats.totalApplications} applications` : "",
      view: "recruitment",
    },
    {
      label: "New Applications",
      value: data?.stats.newApplications ?? "—",
      tone: "green",
      icon: FileText,
      hint: "last 7 days",
      view: "recruitment",
    },
    {
      label: "Shortlisted",
      value: data?.stats.shortlisted ?? "—",
      tone: "amber",
      icon: UserCheck,
      hint: data ? `${data.stats.analysedEmployees} employees analysed` : "",
      view: "recruitment",
    },
  ];

  const iconBg = (tone) =>
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "green"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-violet-100 text-violet-700";

  // The donut still shows vacancy mix, now weighted by real openings per dept.
  const vacancies = data?.vacancies || [];
  const totalVacancies = vacancies.reduce((sum, v) => sum + v.openings, 0);
  const donutColors = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ec4899", "#14b8a6"];

  const donutStyle = {
    background: totalVacancies
      ? `conic-gradient(${vacancies
          .reduce(
            (acc, v, i) => {
              const start = acc.cursor;
              const end = start + (v.openings / totalVacancies) * 100;
              acc.cursor = end;
              acc.parts.push(`${donutColors[i % donutColors.length]} ${start}% ${end}%`);
              return acc;
            },
            { cursor: 0, parts: [] }
          )
          .parts.join(", ")})`
      : "conic-gradient(#e2e8f0 0 100%)",
  };

  const distribution = data
    ? [
        { label: "Low", percent: data.attrition.percentages.Low, count: data.attrition.tiers.Low, color: "bg-blue-500" },
        {
          label: "Medium",
          percent: data.attrition.percentages.Medium,
          count: data.attrition.tiers.Medium,
          color: "bg-orange-500",
        },
        {
          label: "High",
          percent: data.attrition.percentages.High,
          count: data.attrition.tiers.High + data.attrition.tiers.Critical,
          color: "bg-pink-500",
        },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-[28px] border border-slate-200 bg-white p-16 text-sm text-slate-500 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div
        className="p-6"
        style={{
          background:
            "linear-gradient(135deg, #EEF2FF 0%, #EEF2FF 52%, #FFFFFF 52%, #FFFFFF 100%)",
        }}
      >
        {error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.6fr_0.9fr]">
          {/* LEFT */}
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    onClick={() => s.view && onNavigate?.(s.view)}
                    className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <div className="text-xs text-slate-500">{s.label}</div>
                        <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{s.value}</div>
                        {s.hint ? <div className="mt-0.5 truncate text-[11px] text-slate-400">{s.hint}</div> : null}
                      </div>
                      <div className={cx("h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center", iconBg(s.tone))}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Upskilling + Attrition */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Upskilling Overview</div>
                  <button
                    onClick={() => onNavigate?.("upskilling")}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    View All
                  </button>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold text-slate-900">{data?.upskilling.pathCount ?? 0}</div>
                  <div className="text-xs text-slate-500">Learning paths generated</div>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    {
                      k: "Average job readiness",
                      v: data?.upskilling.avgReadiness ?? 0,
                      display: `${data?.upskilling.avgReadiness ?? 0}%`,
                      c: "bg-emerald-500",
                    },
                    {
                      k: "Attrition coverage",
                      v: data?.stats.totalEmployees
                        ? Math.round((data.stats.analysedEmployees / data.stats.totalEmployees) * 100)
                        : 0,
                      display: `${data?.stats.analysedEmployees ?? 0} / ${data?.stats.totalEmployees ?? 0}`,
                      c: "bg-blue-500",
                    },
                    {
                      k: "Training hours planned",
                      v: Math.min(100, (data?.upskilling.totalHours ?? 0) / 10),
                      display: `${data?.upskilling.totalHours ?? 0}h · $${data?.upskilling.totalCostUsd ?? 0}`,
                      c: "bg-amber-500",
                    },
                  ].map((row) => (
                    <div key={row.k}>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{row.k}</span>
                        <span className="font-semibold text-slate-700">{row.display}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={cx("h-full rounded-full transition-all duration-700", row.c)}
                          style={{ width: `${Math.min(100, row.v)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Attrition Risk Distribution</div>
                  <Pill className="bg-slate-100 text-slate-700 border border-slate-200">
                    {data?.attrition.analysed ?? 0} analysed
                  </Pill>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  {data?.attrition.analysed ? (
                    <div className="mt-6 grid grid-cols-3 gap-10 items-end h-[220px] px-6">
                      {distribution.map((d) => (
                        <div key={d.label} className="flex flex-col items-center justify-end h-full">
                          <div className="text-sm font-bold text-slate-800 mb-2">{d.label}</div>
                          <div
                            className={cx("w-14 rounded-sm border border-slate-700/50 transition-all duration-700", d.color)}
                            style={{ height: `${Math.max(2, d.percent)}%` }}
                          />
                          <div className="mt-2 text-sm font-semibold text-slate-700">{d.percent}%</div>
                          <div className="text-[11px] text-slate-400">{d.count} people</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-[220px] flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-8 w-8 text-slate-300" />
                      <div className="mt-3 text-sm font-semibold text-slate-700">No predictions yet</div>
                      <div className="mt-1 max-w-xs text-xs text-slate-500">
                        Run <code className="rounded bg-slate-100 px-1">npm run db:precompute</code> to fill the
                        attrition analysis for every employee.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-5">
            {/* Top attrition risk — the same list that drives the admin bell */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  Top attrition risk
                </div>
                <button
                  onClick={() => onNavigate?.("employees")}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  View All
                </button>
              </div>

              {topRisk.length === 0 ? (
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                  No predictions computed yet.
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {topRisk.map((e) => (
                    <button
                      key={e.EmployeeNumber}
                      onClick={() => onNavigate?.("employees", e.id || String(e.EmployeeNumber))}
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-rose-200 hover:bg-rose-50/40"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-rose-600 text-[11px] font-bold text-white">
                        {e.initials || `#${e.rank}`}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">
                          {e.name || `Employee #${e.EmployeeNumber}`}
                        </div>
                        <div className="truncate text-[11px] text-slate-500">
                          {e.JobRole || "—"} · {e.primary_reason || "N/A"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold text-rose-600">{e.attrition_pct}%</div>
                        <div className="text-[10px] text-slate-400">{e.risk_tier}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vacancy Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Job Vacancy Summary</div>
              <div className="mt-4 flex items-center gap-4">
                <div className="relative h-36 w-36 shrink-0 rounded-full" style={donutStyle}>
                  <div className="absolute inset-4 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-900">{totalVacancies}</div>
                      <div className="text-xs text-slate-500">Vacancies</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-sm">
                  {vacancies.length === 0 ? (
                    <div className="text-xs text-slate-500">No open positions.</div>
                  ) : (
                    vacancies.map((v, i) => (
                      <div key={v.dept} className="flex items-center gap-2 text-slate-700">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: donutColors[i % donutColors.length] }}
                        />
                        <span className="truncate">
                          {v.dept} ({String(v.openings).padStart(2, "0")})
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Headcount by department */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Employees by department</div>
                <button
                  onClick={() => onNavigate?.("employees")}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  View All
                </button>
              </div>

              <div className="mt-3 space-y-3">
                {(data?.departments || []).slice(0, 5).map((t) => (
                  <div
                    key={t.name}
                    className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900">{t.name}</div>
                      <div className="text-xs text-slate-500">Total Members: {t.members}</div>
                    </div>
                    <div className="flex -space-x-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-7 w-7 rounded-full border-2 border-white bg-gradient-to-br from-indigo-200 to-sky-200"
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {!data?.departments?.length && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                    No employees loaded. Run <code className="rounded bg-white px-1">npm run db:seed</code>.
                  </div>
                )}
              </div>
            </div>

            {/* Recent live interventions */}
            {data?.recentEvents?.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Zap className="h-4 w-4 text-emerald-500" />
                  Recent live interventions
                </div>
                <div className="mt-3 space-y-2">
                  {data.recentEvents.slice(0, 5).map((event) => {
                    const improved = event.delta != null && event.delta < 0;
                    return (
                      <div key={event._id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 text-xs font-semibold text-slate-800">
                            <span className="truncate">{event.employeeName || `#${event.EmployeeNumber}`}</span>
                            <span className="font-normal text-slate-500"> · {event.feature_label}</span>
                          </div>
                          {event.delta != null && (
                            <div
                              className={cx(
                                "flex shrink-0 items-center gap-0.5 text-xs font-bold",
                                improved ? "text-emerald-600" : "text-rose-600"
                              )}
                            >
                              <TrendingDown className={cx("h-3 w-3", !improved && "rotate-180")} />
                              {Math.abs(event.delta * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleDashboard;

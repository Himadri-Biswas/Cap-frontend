import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BriefcaseBusiness,
  FileText,
  GraduationCap,
  Loader2,
  TrendingDown,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import Panel, { Stat, EmptyState } from "../../components/ui/Panel.jsx";
import { Meter } from "../../components/Delta.jsx";
import { CountUp } from "../../components/Motion.jsx";
import Pill from "../../components/ui/Pill.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";

/**
 * Overview.
 *
 * Opens on the one number an HR lead actually acts on — how many people are
 * at critical attrition risk right now — rather than a row of equally-weighted
 * KPI tiles. Everything below it is ordered by how urgent it is: who is at
 * risk, then what's moving in hiring, then the standing totals.
 *
 * Every figure is live from MongoDB.
 */

const RISK_BANDS = [
  { key: "Critical", tone: "risk", label: "Critical" },
  { key: "High", tone: "risk", label: "High" },
  { key: "Medium", tone: "raw", label: "Medium" },
  { key: "Low", tone: "ok", label: "Low" },
];

function SimpleDashboard({ jobs = [], employees = [], onNavigate }) {
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
          api.attrition.topRisk(6).catch(() => ({ employees: [] })),
        ]);
        if (cancelled) return;
        setData(dashboard);
        setTopRisk(risk.employees || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load the overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tiers = data?.attrition?.tiers || {};
  const analysed = data?.attrition?.analysed ?? 0;
  const atRisk = (tiers.Critical || 0) + (tiers.High || 0);
  const coverage = data?.stats?.totalEmployees
    ? Math.round((data.stats.analysedEmployees / data.stats.totalEmployees) * 100)
    : 0;

  const bands = useMemo(
    () =>
      RISK_BANDS.map((band) => ({
        ...band,
        count: tiers[band.key] || 0,
        share: analysed ? ((tiers[band.key] || 0) / analysed) * 100 : 0,
      })),
    [tiers, analysed]
  );

  if (loading) {
    return (
      <div className="panel flex items-center justify-center gap-3 p-20 text-sm text-mist-500">
        <Loader2 className="h-4 w-4 animate-spin text-brand" aria-hidden="true" />
        Loading the overview
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="panel border-risk/35 bg-risk/8 p-4 text-sm text-risk">{error}</div>
      )}

      {/* ── The headline. One figure, the thing worth acting on today. ───── */}
      <section className="feature enter" style={{ "--i": 0 }}>
        <div className="relative grid gap-8 p-7 lg:grid-cols-[1.05fr_1fr] lg:p-9">
          <div>
            <span className="num text-[10px] font-medium uppercase tracking-[0.2em] feature-faint">
              People at risk of leaving
            </span>
            <div className="mt-3 flex items-end gap-4">
              <span className="num display-xl text-grad text-[88px] text-[#ff7a8f]">
                <CountUp value={atRisk} />
              </span>
              <span className="mb-3 text-sm leading-5 feature-dim">
                of {analysed} analysed
                <br />
                <span className="feature-faint">{coverage}% of headcount scored</span>
              </span>
            </div>
            <p className="mt-4 max-w-md text-sm leading-6 feature-dim">
              Each of these has counterfactual plans attached. Opening one shows what would move the number and by how
              much, scored by the model rather than estimated.
            </p>
            <button
              type="button"
              onClick={() => onNavigate?.("employees")}
              className="mt-6 inline-flex items-center gap-2 rounded-tile bg-paper px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-white"
            >
              Review at-risk employees
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {/* Risk distribution as one stacked rule, not four floating bars. */}
          <div className="self-end">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="num text-[10px] font-medium uppercase tracking-[0.2em] feature-faint">Risk distribution</span>
              <span className="num text-[11px] feature-faint">{analysed} scored</span>
            </div>

            {analysed ? (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/10">
                  {bands.map((band, i) => (
                    <div
                      key={band.key}
                      className={cx(
                        "h-full sweep first:rounded-l-full last:rounded-r-full",
                        band.tone === "risk" ? "bg-[#ff7a8f]" : band.tone === "raw" ? "bg-[#f0b429]" : "bg-[#34d399]"
                      )}
                      style={{ width: `${band.share}%`, "--i": i, opacity: band.key === "High" ? 0.62 : 1 }}
                      title={`${band.label}: ${band.count}`}
                    />
                  ))}
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                  {bands.map((band) => (
                    <div key={band.key} className="flex items-center gap-2 border-b border-white/10 pb-2">
                      <span
                        aria-hidden="true"
                        className={cx(
                          "h-2 w-2 shrink-0 rounded-full",
                          band.tone === "risk" ? "bg-[#ff7a8f]" : band.tone === "raw" ? "bg-[#f0b429]" : "bg-[#34d399]"
                        )}
                        style={{ opacity: band.key === "High" ? 0.62 : 1 }}
                      />
                      <dt className="flex-1 text-xs feature-dim">{band.label}</dt>
                      <dd className="num text-xs font-semibold text-white">{band.count}</dd>
                      <dd className="num w-10 text-right text-[11px] feature-faint">{Math.round(band.share)}%</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <div className="feature-well p-5 text-xs leading-5 feature-dim">
                Nothing scored yet. Run{" "}
                <code className="num rounded bg-ink-750 px-1 text-mist-200">npm run db:precompute</code> to score every
                employee.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Standing totals ────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          index={1}
          label="Headcount"
          value={data?.stats.totalEmployees ?? "—"}
          icon={Users}
          hint={data ? `${data.stats.formerEmployees} former` : ""}
        />
        <Stat
          index={2}
          label="Open roles"
          value={data?.stats.openPositions ?? "—"}
          icon={BriefcaseBusiness}
          hint={data ? `${data.stats.totalApplications} applications` : ""}
        />
        <Stat
          index={3}
          label="New applications"
          value={data?.stats.newApplications ?? "—"}
          icon={FileText}
          tone="brand"
          hint="last 7 days"
        />
        <Stat
          index={4}
          label="Shortlisted"
          value={data?.stats.shortlisted ?? "—"}
          icon={UserCheck}
          tone="ok"
          hint={data ? `${data.stats.analysedEmployees} employees scored` : ""}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div className="space-y-4">
          {/* ── Who to look at first ─────────────────────────────────────── */}
          <Panel
            index={5}
            className="enter"
            title="Highest attrition risk"
            caption="Ranked by the stored probability. The same list drives the alert bell."
            actions={
              <button
                type="button"
                onClick={() => onNavigate?.("employees")}
                className="text-[11px] font-medium text-mist-500 transition-colors hover:text-paper"
              >
                All employees
              </button>
            }
            bodyClassName="p-2"
          >
            {topRisk.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-mist-500">Nothing scored yet.</div>
            ) : (
              <ul>
                {topRisk.map((e, i) => (
                  <li key={e.EmployeeNumber}>
                    <button
                      type="button"
                      onClick={() => onNavigate?.("employees", e.id || String(e.EmployeeNumber))}
                      className="group flex w-full items-center gap-3 rounded-tile px-2 py-2.5 text-left transition-colors hover:bg-ink-750"
                    >
                      <span className="num w-5 shrink-0 text-right text-[11px] text-mist-600">{i + 1}</span>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-tile border border-risk/30 bg-risk/10 text-[10px] font-bold text-risk">
                        {e.initials || "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-paper">
                          {e.name || `Employee #${e.EmployeeNumber}`}
                        </span>
                        <span className="block truncate text-[11px] text-mist-600">
                          {e.JobRole || "—"} · driver: {e.primary_reason || "not identified"}
                        </span>
                      </span>
                      {/* The bar carries the magnitude; the number carries the value. */}
                      <span className="hidden w-24 shrink-0 sm:block">
                        <span className="block h-1 overflow-hidden rounded-full bg-ink-700">
                          <span
                            className="block h-full rounded-full bg-risk sweep"
                            style={{ width: `${Math.min(e.attrition_pct, 100)}%`, "--i": i }}
                          />
                        </span>
                      </span>
                      <span className="num w-14 shrink-0 text-right text-sm font-semibold text-risk">
                        {e.attrition_pct}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ── What changed recently ────────────────────────────────────── */}
          {data?.recentEvents?.length > 0 && (
            <Panel
              index={6}
              className="enter"
              title="Recent interventions"
              caption="Counterfactuals written to the employee record, with the risk the model returned after."
              bodyClassName="p-2"
            >
              <ul className="space-y-0.5">
                {data.recentEvents.slice(0, 5).map((event) => {
                  const improved = event.delta != null && event.delta < 0;
                  return (
                    <li
                      key={event._id}
                      className="flex items-center gap-3 rounded-tile px-2 py-2 transition-colors hover:bg-ink-750"
                    >
                      <Zap
                        className={cx("h-3.5 w-3.5 shrink-0", improved ? "text-ok" : "text-mist-600")}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-paper">
                          {event.employeeName || `#${event.EmployeeNumber}`}
                        </span>
                        <span className="block truncate text-[11px] text-mist-600">{event.feature_label}</span>
                      </span>
                      {event.prob_before != null && event.prob_after != null && (
                        <span className="num hidden shrink-0 text-[11px] text-mist-500 sm:block">
                          {(event.prob_before * 100).toFixed(0)}
                          <span className="mx-1 text-mist-700">→</span>
                          <span className={improved ? "text-ok" : "text-risk"}>
                            {(event.prob_after * 100).toFixed(0)}
                          </span>
                        </span>
                      )}
                      {event.delta != null && (
                        <span
                          className={cx(
                            "num flex shrink-0 items-center gap-0.5 text-xs font-semibold",
                            improved ? "text-ok" : "text-risk"
                          )}
                        >
                          <TrendingDown
                            className={cx("h-3 w-3", !improved && "rotate-180")}
                            aria-hidden="true"
                          />
                          {Math.abs(event.delta * 100).toFixed(1)}
                          <span className="sr-only">{improved ? "points lower" : "points higher"}</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          {/* ── Hiring ───────────────────────────────────────────────────── */}
          <Panel
            index={7}
            className="enter"
            title="Open roles"
            caption={`${data?.vacancies?.length || 0} departments hiring`}
            actions={
              <button
                type="button"
                onClick={() => onNavigate?.("recruitment")}
                className="text-[11px] font-medium text-mist-500 transition-colors hover:text-paper"
              >
                Recruitment
              </button>
            }
          >
            {(data?.vacancies || []).length === 0 ? (
              <p className="py-4 text-xs text-mist-500">No open positions.</p>
            ) : (
              <div className="space-y-2.5">
                {(data.vacancies || []).map((v, i) => {
                  const top = Math.max(...data.vacancies.map((x) => x.openings), 1);
                  return (
                    <Meter
                      key={v.dept}
                      label={v.dept}
                      value={v.openings}
                      max={top}
                      tone="brand"
                      index={i}
                      right={String(v.openings).padStart(2, "0")}
                    />
                  );
                })}
              </div>
            )}
          </Panel>

          {/* ── Learning ─────────────────────────────────────────────────── */}
          <Panel
            index={8}
            className="enter"
            title="Upskilling"
            caption="Learning paths generated under time and budget limits"
            actions={
              <button
                type="button"
                onClick={() => onNavigate?.("upskilling")}
                className="text-[11px] font-medium text-mist-500 transition-colors hover:text-paper"
              >
                Open
              </button>
            }
          >
            <div className="flex items-end justify-between">
              <div>
                <div className="num display text-4xl font-bold text-paper">{data?.upskilling.pathCount ?? 0}</div>
                <div className="mt-0.5 text-[11px] text-mist-600">paths built</div>
              </div>
              <GraduationCap className="h-5 w-5 text-mist-700" aria-hidden="true" />
            </div>

            <div className="mt-5 space-y-3">
              <Meter
                label="Job readiness"
                value={data?.upskilling.avgReadiness ?? 0}
                max={100}
                tone="fair"
                index={0}
                right={`${data?.upskilling.avgReadiness ?? 0}%`}
              />
              <Meter
                label="Scored headcount"
                value={coverage}
                max={100}
                tone="brand"
                index={1}
                right={`${coverage}%`}
              />
              <div className="flex items-baseline justify-between border-t border-ink-700 pt-3">
                <span className="text-xs text-mist-400">Planned training</span>
                <span className="num text-xs font-semibold text-paper">
                  {data?.upskilling.totalHours ?? 0}h · ${data?.upskilling.totalCostUsd ?? 0}
                </span>
              </div>
            </div>
          </Panel>

          {/* ── Headcount ────────────────────────────────────────────────── */}
          <Panel index={9} className="enter" title="Headcount by department">
            {(data?.departments || []).length === 0 ? (
              <p className="py-2 text-xs text-mist-500">
                No employees loaded. Run <code className="num rounded bg-ink-750 px-1">npm run db:seed</code>.
              </p>
            ) : (
              <div className="space-y-2.5">
                {(data.departments || []).slice(0, 6).map((t, i) => {
                  const top = Math.max(...data.departments.map((x) => x.members), 1);
                  return (
                    <Meter
                      key={t.name}
                      label={t.name}
                      value={t.members}
                      max={top}
                      tone="fair"
                      index={i}
                      right={String(t.members)}
                    />
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default SimpleDashboard;

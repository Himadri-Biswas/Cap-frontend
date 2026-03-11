import React from "react";
import { Users } from "lucide-react";
import Pill from "../../components/ui/Pill.jsx";
import { cx } from "../../lib/cx.js";

function SimpleDashboard({ jobs }) {
  const stats = [
    { label: "Total Employees", value: 735, tone: "blue" },
    { label: "Today's Attendance", value: "97%", tone: "green" },
    { label: "Leave Employees", value: 23, tone: "amber" },
    { label: "Open Positions", value: 18, tone: "purple" },
  ];

  const iconBg = (tone) =>
    tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : tone === "green"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-violet-100 text-violet-700";

  const dot = (tone) =>
    tone === "blue"
      ? "bg-blue-600"
      : tone === "green"
      ? "bg-emerald-600"
      : tone === "amber"
      ? "bg-amber-600"
      : "bg-violet-600";

  const donutStyle = {
    background:
      "conic-gradient(#3b82f6 0 36%, #8b5cf6 36% 56%, #f59e0b 56% 88%, #22c55e 88% 100%)",
  };

  return (
    <div className="rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-sm">
      <div
        className="p-6"
        style={{
          background:
            "linear-gradient(135deg, #EEF2FF 0%, #EEF2FF 52%, #FFFFFF 52%, #FFFFFF 100%)",
        }}
      >
        <div className="grid gap-5 lg:grid-cols-[1.6fr_0.9fr]">
          {/* LEFT */}
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500">{s.label}</div>
                      <div className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{s.value}</div>
                    </div>
                    <div className={cx("h-12 w-12 rounded-2xl flex items-center justify-center", iconBg(s.tone))}>
                      <Users className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Project + Job Stats */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Project Overview</div>
                  <button className="text-xs text-slate-500 hover:text-slate-700">View All</button>
                </div>
                <div className="mt-4">
                  <div className="text-2xl font-bold text-slate-900">175</div>
                  <div className="text-xs text-slate-500">Projects</div>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    { k: "Signed", v: 20, c: "bg-blue-500" },
                    { k: "Manager Review", v: 35, c: "bg-emerald-500" },
                    { k: "Client Review", v: 45, c: "bg-amber-500" },
                  ].map((row) => (
                    <div key={row.k}>
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{row.k}</span>
                        <span>{row.v}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className={cx("h-full rounded-full", row.c)} style={{ width: `${row.v}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">Attrition Risk Distribution</div>
                  <Pill className="bg-slate-100 text-slate-700 border border-slate-200">Attrition risk</Pill>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                  {/* Axis-style bar chart based on 735 employees */}
                  {(() => {
                    const total = 735;
                    const distribution = [
                      { label: "Low", percent: 68, color: "bg-blue-500" },
                      { label: "Medium", percent: 20, color: "bg-orange-500" },
                      { label: "High", percent: 12, color: "bg-pink-500" },
                    ];

                    const max = 100;

                    return (
                      <div className="mt-6 grid grid-cols-3 gap-10 items-end h-[220px] px-6">
                        {distribution.map((d) => (
                          <div key={d.label} className="flex flex-col items-center justify-end h-full">
                            <div className="text-sm font-bold text-slate-800 mb-2">{d.label}</div>
                            <div
                              className={cx("w-14 rounded-sm border border-slate-700/50", d.color)}
                              style={{ height: `${d.percent}%` }}
                            />
                            <div className="mt-2 text-sm font-semibold text-slate-700">{d.percent}%</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-5">
            {/* Vacancy Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-slate-900">Job Vacancy Summary</div>
              <div className="mt-4 flex items-center gap-4">
                <div className="relative h-36 w-36 rounded-full" style={donutStyle}>
                  <div className="absolute inset-4 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-900">25</div>
                      <div className="text-xs text-slate-500">Vacancies</div>
                    </div>
                  </div>
                </div>
                <div className="flex-1 space-y-2 text-sm">
                  {["Visual (09)","Developer (05)","Product (08)","Technical Assistant (03)"].map((x,i)=>(
                    <div key={i} className="text-slate-700">• {x}</div>
                  ))}
                </div>
              </div>
            </div>

            {/* Employee */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">Employee</div>
                <button className="text-xs text-slate-500 hover:text-slate-700">View All</button>
              </div>

              <div className="mt-3 space-y-3">
                {[
                  { name: "Design Team", members: 125 },
                  { name: "Development", members: 150 },
                  { name: "Finance", members: 95 },
                  { name: "Management", members: 50 },
                ].map((t) => (
                  <div key={t.name} className="rounded-2xl border border-slate-200 bg-white p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                      <div className="text-xs text-slate-500">Total Members: {t.members}</div>
                    </div>
                    <div className="flex -space-x-2">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-7 w-7 rounded-full border-2 border-white bg-gradient-to-br from-indigo-200 to-sky-200" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleDashboard;

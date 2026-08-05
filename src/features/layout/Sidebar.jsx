import React from "react";
import { ArrowRight, ClipboardList, LayoutDashboard, TrendingUp, UserRound, UsersRound } from "lucide-react";
import { cx } from "../../lib/cx.js";
import { useSession } from "../../auth/SessionProvider.jsx";
import { RoleChip } from "./UserMenu.jsx";

/**
 * The four original nav items are unchanged. "People" is added for admins —
 * that is where roles are granted, which is the UI half of RBAC.
 * `badges` lets a caller surface a live count (e.g. new applications).
 */
function Sidebar({ active, onChange, badges = {} }) {
  const { activeRole, isAdmin } = useSession();

  const items = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "employees", label: "Employees", icon: UserRound },
    { key: "recruitment", label: "Job Recruitment", icon: ClipboardList },
    { key: "upskilling", label: "Upskilling", icon: TrendingUp },
    ...(isAdmin ? [{ key: "people", label: "People & Roles", icon: UsersRound }] : []),
  ];

  return (
    <div className="h-full p-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-white font-black">
            HR
          </div>
          <div className="min-w-0">
            <div className="font-bold tracking-tight text-slate-900">TalentPulse</div>
            <div className="text-xs text-slate-500">Intelligent HRMS</div>
          </div>
        </div>

        <div className="mt-3">
          <RoleChip role={activeRole} />
        </div>

        <div className="mt-5 space-y-2">
          {items.map(({ key, label, icon: Icon }) => {
            const isActive = active === key;
            const badge = badges[key];
            return (
              <button
                key={key}
                onClick={() => onChange(key)}
                className={cx(
                  "w-full flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                  isActive ? "bg-indigo-50 border-indigo-200" : "bg-white hover:bg-slate-50 border-slate-200"
                )}
              >
                <span
                  className={cx(
                    "h-10 w-10 rounded-2xl flex items-center justify-center border",
                    isActive ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-200"
                  )}
                >
                  <Icon className={cx("h-5 w-5", isActive ? "text-indigo-600" : "text-slate-600")} />
                </span>
                <span className="flex-1">
                  <div className={cx("font-semibold text-sm", isActive ? "text-slate-900" : "text-slate-800")}>
                    {label}
                  </div>
                </span>
                {badge ? (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : (
                  <ArrowRight className={cx("h-4 w-4", isActive ? "text-indigo-600" : "text-slate-300")} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;

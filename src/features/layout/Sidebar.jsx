import React from "react";
import { ClipboardList, LayoutDashboard, TrendingUp, UserRound, UsersRound } from "lucide-react";
import { cx } from "../../lib/cx.js";
import { useSession } from "../../auth/SessionProvider.jsx";

/**
 * The nav rail.
 *
 * A 68px column of icons that widens to show labels on hover or keyboard
 * focus. A permanent 320px sidebar spends a fifth of a laptop screen on five
 * words that never change; this gives that space back to the data and still
 * keeps every destination one click away.
 *
 * The rail never collapses the labels away from assistive tech — they are in
 * the DOM at all times and only the visual width animates.
 */
const NAV = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "employees", label: "Employees", icon: UserRound },
  { key: "recruitment", label: "Recruitment", icon: ClipboardList },
  { key: "upskilling", label: "Upskilling", icon: TrendingUp },
  { key: "people", label: "People & roles", icon: UsersRound, adminOnly: true },
];

function Sidebar({ active, onChange, badges = {} }) {
  const { isAdmin } = useSession();
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav
      aria-label="Sections"
      className={cx(
        "group/rail fixed left-0 top-0 z-40 hidden h-screen w-[68px] flex-col border-r border-ink-600 bg-ink-850",
        "transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:w-[228px] focus-within:w-[228px]",
        "lg:flex"
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-ink-600 px-[18px]">
        <span
          aria-hidden="true"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-tile bg-brand text-[13px] font-bold text-white"
        >
          TP
        </span>
        <span className="min-w-0 opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
          <span className="block truncate font-display text-sm font-bold tracking-tight text-paper">TalentPulse</span>
          <span className="block truncate text-[10px] text-mist-600">Fair hiring · retention</span>
        </span>
      </div>

      <ul className="flex-1 space-y-1 overflow-hidden p-3">
        {items.map(({ key, label, icon: Icon }) => {
          const isActive = active === key;
          const badge = badges[key];
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChange(key)}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "relative flex h-11 w-full items-center gap-3.5 overflow-hidden rounded-tile px-[10px] text-left transition-colors duration-150",
                  isActive ? "bg-ink-700 text-paper" : "text-mist-400 hover:bg-ink-800 hover:text-paper"
                )}
              >
                {/* The active marker is a bar, not a fill — it survives at any rail width. */}
                <span
                  aria-hidden="true"
                  className={cx(
                    "absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity duration-200",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100">
                  {label}
                </span>
                {badge ? (
                  <span className="num shrink-0 rounded-chip bg-risk px-1.5 text-[10px] font-bold text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The same destinations as a bottom bar, for screens too narrow for a rail. */
export function MobileNav({ active, onChange, badges = {} }) {
  const { isAdmin } = useSession();
  const items = NAV.filter((item) => !item.adminOnly || isAdmin);

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-ink-600 bg-ink-850/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map(({ key, label, icon: Icon }) => {
        const isActive = active === key;
        const badge = badges[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 transition-colors",
              isActive ? "text-brand-hi" : "text-mist-500"
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
            <span className="truncate text-[10px] font-medium">{label.split(" ")[0]}</span>
            {badge ? (
              <span className="num absolute right-1/4 top-2 rounded-chip bg-risk px-1 text-[9px] font-bold text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export default Sidebar;

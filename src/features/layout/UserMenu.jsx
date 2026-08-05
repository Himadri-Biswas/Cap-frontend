/**
 * UserMenu — identity, role indicator and the role switcher.
 *
 * The coloured role chip is the "separate UI indicator" each kind of user
 * carries: violet for admin, emerald for a current employee, indigo for an
 * applicant. When someone holds more than one role, this is also where they
 * switch — a current employee flips to "Applicant" here to go apply for
 * another position, on the same account and the same email.
 */
import React, { useEffect, useRef, useState } from "react";
import { Briefcase, Check, ChevronDown, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useSession } from "../../auth/SessionProvider.jsx";
import { cx } from "../../lib/cx.js";

export const ROLE_META = {
  admin: {
    label: "Admin",
    caption: "HR Manager",
    icon: ShieldCheck,
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    dot: "bg-violet-500",
    avatar: "from-violet-500 to-indigo-600",
  },
  employee: {
    label: "Employee",
    caption: "Current employee",
    icon: Briefcase,
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
    avatar: "from-emerald-500 to-teal-600",
  },
  applicant: {
    label: "Applicant",
    caption: "Job seeker",
    icon: UserRound,
    chip: "border-indigo-200 bg-indigo-50 text-indigo-700",
    dot: "bg-indigo-500",
    avatar: "from-indigo-500 to-sky-500",
  },
};

export function RoleChip({ role, className = "" }) {
  const meta = ROLE_META[role] || ROLE_META.applicant;
  const Icon = meta.icon;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
        meta.chip,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export default function UserMenu() {
  const { user, roles, activeRole, switchRole, signOut, hasMultipleRoles } = useSession();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onClickAway = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const meta = ROLE_META[activeRole] || ROLE_META.applicant;
  const initials =
    (user.firstName?.[0] || "") + (user.lastName?.[0] || "") || user.email.slice(0, 2).toUpperCase();

  async function handleSwitch(role) {
    if (role === activeRole) return setOpen(false);
    setSwitching(role);
    try {
      await switchRole(role);
      setOpen(false);
    } finally {
      setSwitching(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "flex items-center gap-2 rounded-2xl border px-3 py-2 transition",
          open ? "border-indigo-300 bg-indigo-50" : "border-slate-200 bg-white hover:bg-slate-50"
        )}
      >
        <div
          className={cx(
            "flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white",
            meta.avatar
          )}
        >
          {initials.toUpperCase()}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-sm font-semibold leading-4 text-slate-900">
            {user.firstName || user.fullName || user.email.split("@")[0]}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <span className={cx("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.caption}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-sm font-bold text-white",
                  meta.avatar
                )}
              >
                {initials.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-slate-900">{user.fullName || user.email}</div>
                <div className="truncate text-xs text-slate-500">{user.email}</div>
              </div>
            </div>
            {user.employeeNumber ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Employee <span className="font-semibold text-slate-800">#{user.employeeNumber}</span>
                {user.jobTitle ? ` · ${user.jobTitle}` : ""}
              </div>
            ) : null}
          </div>

          {hasMultipleRoles && (
            <div className="border-b border-slate-100 p-2">
              <div className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Switch workspace
              </div>
              {roles.map((role) => {
                const roleMeta = ROLE_META[role];
                const Icon = roleMeta.icon;
                const isActive = role === activeRole;
                return (
                  <button
                    key={role}
                    onClick={() => handleSwitch(role)}
                    disabled={switching !== null}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition disabled:opacity-60",
                      isActive ? "bg-slate-50" : "hover:bg-slate-50"
                    )}
                  >
                    <span className={cx("flex h-8 w-8 items-center justify-center rounded-xl border", roleMeta.chip)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{roleMeta.label}</span>
                      <span className="block text-[11px] text-slate-500">{roleMeta.caption}</span>
                    </span>
                    {isActive && <Check className="h-4 w-4 text-indigo-600" />}
                    {switching === role && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="p-2">
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-rose-200 bg-rose-50">
                <LogOut className="h-4 w-4" />
              </span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

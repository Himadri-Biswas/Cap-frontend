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
    chip: "border-brand/35 bg-brand/12 text-brand-hi",
    dot: "bg-brand",
    avatar: "bg-brand text-white",
  },
  employee: {
    label: "Employee",
    caption: "Current employee",
    icon: Briefcase,
    chip: "border-fair/35 bg-fair/12 text-fair",
    dot: "bg-fair",
    avatar: "bg-fair text-ink-950",
  },
  applicant: {
    label: "Applicant",
    caption: "Job seeker",
    icon: UserRound,
    chip: "border-ink-500 bg-ink-700 text-mist-200",
    dot: "bg-mist-400",
    avatar: "bg-ink-700 text-paper",
  },
};

export function RoleChip({ role, className = "" }) {
  const meta = ROLE_META[role] || ROLE_META.applicant;
  const Icon = meta.icon;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-[11px] font-semibold",
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
          "flex h-9 items-center gap-2 rounded-tile border pl-1 pr-2 transition-colors",
          open ? "border-brand/50 bg-ink-750" : "border-ink-600 bg-ink-850 hover:border-ink-400"
        )}
      >
        <div
          className={cx(
            "flex h-7 w-7 items-center justify-center rounded-chip text-[11px] font-bold",
            meta.avatar
          )}
        >
          {initials.toUpperCase()}
        </div>
        <div className="hidden text-left sm:block">
          <div className="text-[13px] font-medium leading-4 text-paper">
            {user.firstName || user.fullName || user.email.split("@")[0]}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-mist-600">
            <span className={cx("h-1.5 w-1.5 rounded-full", meta.dot)} />
            {meta.caption}
          </div>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-mist-600" aria-hidden="true" />
      </button>

      {open && (
        <div className="panel absolute right-0 z-40 mt-2 w-72 overflow-hidden animate-[rise_200ms_var(--ease-out-soft)_both]">
          <div className="border-b border-ink-600 p-4">
            <div className="flex items-center gap-3">
              <div
                className={cx(
                  "flex h-10 w-10 items-center justify-center rounded-tile text-sm font-bold",
                  meta.avatar
                )}
              >
                {initials.toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-paper">{user.fullName || user.email}</div>
                <div className="truncate text-xs text-mist-600">{user.email}</div>
              </div>
            </div>
            {user.employeeNumber ? (
              <div className="mt-3 rounded-tile border border-ink-600 bg-ink-850 px-3 py-2 text-xs text-mist-400">
                Employee <span className="num font-semibold text-paper">#{user.employeeNumber}</span>
                {user.jobTitle ? ` · ${user.jobTitle}` : ""}
              </div>
            ) : null}
          </div>

          {hasMultipleRoles && (
            <div className="border-b border-ink-600 p-2">
              <div className="eyebrow px-2 py-1.5">
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
                      "flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left transition-colors disabled:opacity-60",
                      isActive ? "bg-ink-700" : "hover:bg-ink-800"
                    )}
                  >
                    <span className={cx("flex h-8 w-8 items-center justify-center rounded-tile border", roleMeta.chip)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[13px] font-medium text-paper">{roleMeta.label}</span>
                      <span className="block text-[11px] text-mist-600">{roleMeta.caption}</span>
                    </span>
                    {isActive && <Check className="h-4 w-4 text-brand-hi" aria-hidden="true" />}
                    {switching === role && (
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="p-2">
            <button
              onClick={() => signOut()}
              className="flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left text-[13px] font-medium text-risk transition-colors hover:bg-risk/10"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-tile border border-risk/30 bg-risk/10">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PeopleView — admin-side RBAC.
 *
 * Roles are a SET, not a single value, which is what makes promotion
 * non-destructive: granting "Current employee" to an applicant leaves their
 * applicant identity (and their application history) completely intact, so the
 * room-cleaner-turned-ML-engineer case needs no second account and no second
 * email. Revoking `employee` flips their employee record to `former`, which is
 * exactly what later earns them the POSITIVE "former employee" tag if they
 * apply again.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  Check,
  Loader2,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import Modal from "../../components/ui/Modal.jsx";
import Pill from "../../components/ui/Pill.jsx";
import { cx } from "../../lib/cx.js";
import { api } from "../../lib/api.js";
import { useSession } from "../../auth/SessionProvider.jsx";
import { ROLE_META } from "../layout/UserMenu.jsx";

const ROLE_FILTERS = [
  { key: "", label: "Everyone", icon: UsersRound },
  { key: "admin", label: "Admins", icon: ShieldCheck },
  { key: "employee", label: "Employees", icon: Briefcase },
  { key: "applicant", label: "Applicants", icon: UserRound },
];

export default function PeopleView({ search = "" }) {
  const { user: me, refresh } = useSession();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [detail, setDetail] = useState(null); // the user whose modal is open
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Employee-linking picker (only used when granting `employee`)
  const [linkQuery, setLinkQuery] = useState("");
  const [linkOptions, setLinkOptions] = useState([]);
  const [linkChoice, setLinkChoice] = useState(null);
  const [linkLoading, setLinkLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.users.list({ q: search, role: roleFilter, limit: 200 });
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message || "Could not load people.");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // Load linkable employee records when the picker is open.
  useEffect(() => {
    if (!detail) return undefined;
    let cancelled = false;
    setLinkLoading(true);
    api.users
      .linkableEmployees({ q: linkQuery, limit: 25 })
      .then((data) => !cancelled && setLinkOptions(data.employees || []))
      .catch(() => !cancelled && setLinkOptions([]))
      .finally(() => !cancelled && setLinkLoading(false));
    return () => {
      cancelled = true;
    };
  }, [detail, linkQuery]);

  const counts = useMemo(() => {
    const out = { admin: 0, employee: 0, applicant: 0 };
    for (const u of users) for (const r of u.roles || []) if (r in out) out[r] += 1;
    return out;
  }, [users]);

  async function changeRole(targetUser, role, action) {
    setBusy(true);
    setActionError(null);
    try {
      const payload = { role, action };
      if (action === "grant" && role === "employee" && linkChoice) {
        payload.employeeNumber = linkChoice.EmployeeNumber;
      }
      const data = await api.users.setRole(targetUser.clerkUserId, payload);
      setDetail(data.user);
      setLinkChoice(null);
      await load();
      // If the admin changed their OWN roles, refresh the session immediately.
      if (targetUser.clerkUserId === me?.clerkUserId) await refresh();
    } catch (err) {
      setActionError(err.message || "Could not change the role.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(targetUser) {
    setBusy(true);
    setActionError(null);
    try {
      const next = targetUser.status === "active" ? "suspended" : "active";
      const data = await api.users.setStatus(targetUser.clerkUserId, next);
      setDetail(data.user);
      await load();
    } catch (err) {
      setActionError(err.message || "Could not change account status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary + filters */}
      <div className="rounded-panel border border-ink-600 bg-ink-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {ROLE_FILTERS.map(({ key, label, icon: Icon }) => (
              <button
                key={key || "all"}
                onClick={() => setRoleFilter(key)}
                className={cx(
                  "inline-flex items-center gap-2 rounded-tile border px-3 py-2 text-sm font-medium transition",
                  roleFilter === key
                    ? "border-brand/35 bg-brand/12 text-brand-hi"
                    : "border-ink-600 bg-ink-800 text-mist-200 hover:bg-ink-750"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {key && counts[key] > 0 ? (
                  <span className="rounded-full bg-ink-750 px-1.5 text-[10px] font-bold text-mist-400">
                    {counts[key]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <Pill className="border border-ink-600 bg-ink-750 text-mist-200">{total} accounts</Pill>
        </div>

        <div className="mt-3 rounded-tile border border-brand/25 bg-brand/8 px-4 py-3 text-xs leading-5 text-mist-200">
          <span className="font-semibold">How roles work.</span> Everyone signs in through the same portal and
          starts as an <span className="font-semibold">applicant</span>. Granting a role adds it — nobody loses
          their existing access, so a current employee can still apply for other jobs from the same account.
          Revoking <span className="font-semibold">employee</span> marks their employee record as{" "}
          <span className="font-semibold">former</span>, which is what shows the green "former employee" tag if
          they ever apply again.
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-panel border border-risk/35 bg-risk/12 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
          <div className="text-sm text-risk">{error}</div>
        </div>
      )}

      {/* People table */}
      <div className="overflow-hidden rounded-panel border border-ink-600 bg-ink-800">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-mist-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading people…
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center">
            <UsersRound className="mx-auto h-10 w-10 text-mist-700" aria-hidden="true" />
            <div className="mt-3 text-sm font-semibold text-mist-200">No accounts yet</div>
            <div className="mt-1 text-xs text-mist-500">
              Accounts appear here the first time someone signs in through Clerk.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table data-table--brand w-full min-w-[720px]">
              <thead className="bg-ink-850 text-left">
                <tr className="text-xs font-semibold uppercase tracking-wider text-mist-500">
                  <th className="px-4 py-3">Person</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Employee record</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Manage</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.clerkUserId} className="border-t border-ink-700 hover:bg-ink-750/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={cx(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full  text-xs font-bold text-paper",
                            ROLE_META[u.activeRole]?.avatar || ROLE_META.applicant.avatar
                          )}
                        >
                          {(u.fullName || u.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-paper">
                            {u.fullName || u.email.split("@")[0]}
                            {u.clerkUserId === me?.clerkUserId && (
                              <span className="ml-2 rounded-full bg-ink-750 px-1.5 py-0.5 text-[10px] font-bold text-mist-500">
                                you
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-mist-500">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.roles.map((role) => {
                          const meta = ROLE_META[role];
                          const Icon = meta.icon;
                          return (
                            <span
                              key={role}
                              className={cx(
                                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                meta.chip
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-mist-400">
                      {u.employeeNumber ? (
                        <>
                          <span className="font-semibold text-paper">#{u.employeeNumber}</span>
                          {u.jobTitle ? <div className="truncate text-mist-500">{u.jobTitle}</div> : null}
                        </>
                      ) : (
                        <span className="text-mist-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cx(
                          "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold capitalize",
                          u.status === "active"
                            ? "border-ok/35 bg-ok/12 text-ok"
                            : "border-risk/35 bg-risk/12 text-risk"
                        )}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => {
                          setDetail(u);
                          setActionError(null);
                          setLinkChoice(null);
                          setLinkQuery("");
                        }}
                        className="rounded-tile border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-mist-200 hover:bg-ink-750"
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manage modal */}
      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        size="md"
        title={detail ? detail.fullName || detail.email : ""}
        subtitle={detail?.email}
      >
        {detail && (
          <div className="space-y-5">
            {actionError && (
              <div className="flex items-start gap-2 rounded-tile border border-risk/35 bg-risk/12 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
                <div className="text-sm text-risk">{actionError}</div>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-mist-500">Roles</div>
              <div className="mt-2 space-y-2">
                {["admin", "employee", "applicant"].map((role) => {
                  const meta = ROLE_META[role];
                  const Icon = meta.icon;
                  const held = detail.roles.includes(role);
                  const locked = role === "applicant"; // baseline, never revocable
                  return (
                    <div
                      key={role}
                      className={cx(
                        "flex items-center gap-3 rounded-tile border p-3",
                        held ? "border-ink-600 bg-ink-850" : "border-ink-600 bg-ink-800"
                      )}
                    >
                      <span className={cx("flex h-9 w-9 items-center justify-center rounded-tile border", meta.chip)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-paper">{meta.label}</div>
                        <div className="text-[11px] text-mist-500">
                          {role === "admin"
                            ? "Full access: screening, attrition, people management."
                            : role === "employee"
                              ? "Sees their own attrition insight and learning paths."
                              : "Baseline access — browse jobs and apply. Always granted."}
                        </div>
                      </div>
                      {locked ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-tile border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11px] font-semibold text-mist-600">
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Always on
                        </span>
                      ) : (
                        <button
                          onClick={() => changeRole(detail, role, held ? "revoke" : "grant")}
                          disabled={busy}
                          className={cx(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-tile px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50",
                            held
                              ? "border border-risk/35 bg-risk/12 text-risk hover:bg-risk/12"
                              : "bg-ink-850 text-paper hover:bg-ink-700"
                          )}
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : held ? (
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {held ? "Revoke" : "Grant"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Employee-record picker — only meaningful before granting `employee` */}
            {!detail.roles.includes("employee") && (
              <div className="rounded-tile border border-ink-600 bg-ink-850 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-mist-500">
                  Link an employee record
                </div>
                <div className="mt-1 text-[11px] text-mist-500">
                  Optional but recommended — this is what gives them an attrition analysis. Pick one, then press
                  Grant on "Employee" above.
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2">
                  <Search className="h-4 w-4 shrink-0 text-mist-600" aria-hidden="true" />
                  <input
                    value={linkQuery}
                    onChange={(e) => setLinkQuery(e.target.value)}
                    type="search"
                    aria-label="Search unlinked employees"
                    placeholder="Search unlinked employees by name or role…"
                    className="w-full bg-transparent text-sm text-paper outline-none placeholder:text-mist-600"
                  />
                </div>

                {linkChoice && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-tile border border-ok/35 bg-ok/12 px-3 py-2">
                    <div className="min-w-0 text-xs text-ok">
                      Selected <span className="font-bold">#{linkChoice.EmployeeNumber}</span>{" "}
                      {linkChoice.name ? `· ${linkChoice.name}` : ""}{" "}
                      {linkChoice.JobRole ? `· ${linkChoice.JobRole}` : ""}
                    </div>
                    <button
                      onClick={() => setLinkChoice(null)}
                      className="shrink-0 rounded-lg p-1 text-ok hover:bg-ok/12"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}

                <div className="mt-2 max-h-44 overflow-y-auto rounded-tile border border-ink-600 bg-ink-800">
                  {linkLoading ? (
                    <div className="flex items-center justify-center gap-2 p-4 text-xs text-mist-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Searching…
                    </div>
                  ) : linkOptions.length === 0 ? (
                    <div className="p-4 text-xs text-mist-500">No unlinked employee records match.</div>
                  ) : (
                    linkOptions.map((emp) => (
                      <button
                        key={emp.EmployeeNumber}
                        onClick={() => setLinkChoice(emp)}
                        className={cx(
                          "flex w-full items-center justify-between gap-2 border-b border-ink-700 px-3 py-2 text-left text-xs transition last:border-0",
                          linkChoice?.EmployeeNumber === emp.EmployeeNumber
                            ? "bg-ok/12"
                            : "hover:bg-ink-750"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-paper">
                            #{emp.EmployeeNumber} {emp.name || ""}
                          </span>
                          <span className="block truncate text-mist-500">
                            {emp.JobRole} · {emp.Department}
                          </span>
                        </span>
                        {linkChoice?.EmployeeNumber === emp.EmployeeNumber && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-ok" aria-hidden="true" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Account status */}
            <div className="flex items-center justify-between gap-3 rounded-tile border border-ink-600 p-4">
              <div>
                <div className="text-sm font-semibold text-paper">Account status</div>
                <div className="text-[11px] text-mist-500">
                  Suspending blocks every API call without deleting anything in Clerk.
                </div>
              </div>
              <button
                onClick={() => toggleStatus(detail)}
                disabled={busy || detail.clerkUserId === me?.clerkUserId}
                title={detail.clerkUserId === me?.clerkUserId ? "You cannot suspend your own account" : ""}
                className={cx(
                  "shrink-0 rounded-tile border px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-50",
                  detail.status === "active"
                    ? "border-risk/35 bg-risk/12 text-risk hover:bg-risk/12"
                    : "border-ok/35 bg-ok/12 text-ok hover:bg-ok/12"
                )}
              >
                {detail.status === "active" ? "Suspend" : "Reactivate"}
              </button>
            </div>

            {detail.roleHistory?.length ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-mist-500">Role history</div>
                <div className="mt-2 space-y-1.5">
                  {[...detail.roleHistory]
                    .reverse()
                    .slice(0, 6)
                    .map((h, i) => (
                      <div key={i} className="rounded-tile border border-ink-600 bg-ink-850 px-3 py-2 text-[11px]">
                        <span
                          className={cx(
                            "font-bold",
                            h.action === "granted" ? "text-ok" : "text-risk"
                          )}
                        >
                          {h.action === "granted" ? "Granted" : "Revoked"} {h.role}
                        </span>
                        <span className="text-mist-500">
                          {" "}
                          · {new Date(h.at).toLocaleDateString()} by {h.byEmail || h.by || "system"}
                        </span>
                        {h.reason ? <div className="mt-0.5 text-mist-600">{h.reason}</div> : null}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

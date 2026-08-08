/**
 * NotificationBell — the admin's alert surface.
 *
 * Its headline job is the standing "top 5 attrition-risk employees" list: the
 * server keeps exactly one live alert per at-risk employee and refreshes it
 * whenever a prediction changes, so opening this panel always shows the
 * current leaderboard rather than a pile of stale duplicates.
 *
 * Clicking an alert deep-links into the matching view (`onNavigate`), which is
 * how "notify the admin of high-attrition employees" turns into an action
 * instead of just a message.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  FileText,
  Loader2,
  ShieldCheck,
  TrendingDown,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "../../lib/api.js";
import { cx } from "../../lib/cx.js";

const TYPE_META = {
  attrition_risk: { icon: AlertTriangle, tone: "text-risk bg-risk/12 border-risk/35" },
  attrition_improved: { icon: TrendingDown, tone: "text-ok bg-ok/12 border-ok/35" },
  new_application: { icon: FileText, tone: "text-brand-hi bg-brand/12 border-brand/35" },
  former_employee_applied: { icon: UserPlus, tone: "text-ok bg-ok/12 border-ok/35" },
  rejected_reapplied: { icon: UserPlus, tone: "text-raw bg-raw/12 border-raw/35" },
  screening_complete: { icon: ShieldCheck, tone: "text-mist-400 bg-ink-750 border-ink-600" },
  role_change: { icon: ShieldCheck, tone: "text-brand-hi bg-brand/12 border-brand/35" },
  system: { icon: Bell, tone: "text-mist-400 bg-ink-750 border-ink-600" },
};

const SEVERITY_BAR = {
  critical: "bg-risk",
  high: "bg-risk",
  medium: "bg-raw",
  low: "bg-brand",
  info: "bg-mist-500",
};

function relativeTime(date) {
  if (!date) return "";
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const load = useCallback(async (refresh) => {
    setLoading(true);
    try {
      const data = await api.notifications.list({ limit: 40, refresh: refresh ? undefined : "false" });
      setNotifications(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch {
      // A dead API must not break the shell — the bell just shows nothing.
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll quietly so a risk change surfaces without a page refresh.
  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(false), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    load(true);
    const onClickAway = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, load]);

  async function markAllRead() {
    setUnread(0);
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    await api.notifications.markAllRead().catch(() => {});
  }

  async function handleClick(notification) {
    if (!notification.read) {
      setUnread((n) => Math.max(0, n - 1));
      setNotifications((list) => list.map((x) => (x.id === notification.id ? { ...x, read: true } : x)));
      api.notifications.markRead(notification.id).catch(() => {});
    }
    if (notification.actionView && onNavigate) {
      onNavigate(notification.actionView, notification.actionId, notification);
      setOpen(false);
    }
  }

  async function dismiss(event, notification) {
    event.stopPropagation();
    setNotifications((list) => list.filter((n) => n.id !== notification.id));
    await api.notifications.dismiss(notification.id).catch(() => {});
  }

  const riskAlerts = notifications.filter((n) => n.type === "attrition_risk");
  const others = notifications.filter((n) => n.type !== "attrition_risk");

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cx(
          "relative flex h-11 w-11 items-center justify-center rounded-tile border transition",
          open ? "border-brand/35 bg-brand/12" : "border-ink-600 bg-ink-800 hover:bg-ink-750"
        )}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
      >
        <Bell className={cx("h-5 w-5", open ? "text-brand-hi" : "text-mist-200")} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-risk px-1 text-[10px] font-bold text-paper ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-panel border border-ink-600 bg-ink-800">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-paper">Notifications</div>
              <div className="text-xs text-mist-500">
                {unread ? `${unread} unread` : "All caught up"}
                {loading ? " · refreshing…" : ""}
              </div>
            </div>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1.5 rounded-tile px-2.5 py-1.5 text-xs font-semibold text-brand-hi hover:bg-brand/12"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            {loading && !notifications.length && (
              <div className="flex items-center justify-center gap-2 p-8 text-sm text-mist-500">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading…
              </div>
            )}

            {!loading && !notifications.length && (
              <div className="p-8 text-center">
                <Bell className="mx-auto h-8 w-8 text-mist-700" aria-hidden="true" />
                <div className="mt-2 text-sm font-medium text-mist-400">Nothing to report</div>
                <div className="mt-1 text-xs text-mist-600">
                  Attrition alerts appear here once predictions are computed.
                </div>
              </div>
            )}

            {riskAlerts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 bg-risk/18 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-risk">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Top {riskAlerts.length} attrition risk
                </div>
                {riskAlerts.map((n) => (
                  <NotificationRow key={n.id} notification={n} onClick={handleClick} onDismiss={dismiss} showRank />
                ))}
              </div>
            )}

            {others.length > 0 && (
              <div>
                {riskAlerts.length > 0 && (
                  <div className="bg-ink-850 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-mist-500">
                    Activity
                  </div>
                )}
                {others.map((n) => (
                  <NotificationRow key={n.id} notification={n} onClick={handleClick} onDismiss={dismiss} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationRow({ notification, onClick, onDismiss, showRank }) {
  const meta = TYPE_META[notification.type] || TYPE_META.system;
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => onClick(notification)}
      className={cx(
        "group relative flex w-full items-start gap-3 border-b border-ink-700 px-4 py-3 text-left transition last:border-0",
        notification.read ? "bg-ink-800 hover:bg-ink-750" : "bg-brand/10 hover:bg-brand/18"
      )}
    >
      <span
        className={cx("absolute left-0 top-0 h-full w-1", SEVERITY_BAR[notification.severity] || SEVERITY_BAR.info)}
      />

      <span className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-tile border", meta.tone)}>
        {showRank && notification.rank ? (
          <span className="text-xs font-black">#{notification.rank}</span>
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span
            className={cx(
              "block text-sm leading-5",
              notification.read ? "font-medium text-mist-200" : "font-bold text-paper"
            )}
          >
            {notification.title}
          </span>
          {!notification.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
        </span>
        {notification.body ? (
          <span className="mt-0.5 block text-xs leading-5 text-mist-500">{notification.body}</span>
        ) : null}
        <span className="mt-1 block text-[11px] text-mist-600">{relativeTime(notification.createdAt)}</span>
      </span>

      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => onDismiss(e, notification)}
        className="mt-0.5 hidden rounded-lg p-1 text-mist-700 transition hover:bg-ink-700 hover:text-mist-400 group-hover:block"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}

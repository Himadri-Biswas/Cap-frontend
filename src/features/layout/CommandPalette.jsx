import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  CornerDownLeft,
  LayoutDashboard,
  Search,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";
import { cx } from "../../lib/cx.js";

/**
 * ⌘K — jump to anything.
 *
 * An HR admin's day is "open this person", "open that role" far more often
 * than it is "browse a list". Typing a name here beats three clicks and a
 * filter, and it makes the whole dataset reachable from every screen without
 * adding another nav item.
 *
 * Fully keyboard driven: arrows move, Enter opens, Escape closes, and the
 * active row is announced through aria-activedescendant.
 */
const DESTINATIONS = [
  { id: "nav:dashboard", kind: "Go to", label: "Dashboard", icon: LayoutDashboard, view: "dashboard" },
  { id: "nav:employees", kind: "Go to", label: "Employees", icon: UserRound, view: "employees" },
  { id: "nav:recruitment", kind: "Go to", label: "Recruitment", icon: ClipboardList, view: "recruitment" },
  { id: "nav:upskilling", kind: "Go to", label: "Upskilling", icon: TrendingUp, view: "upskilling" },
  { id: "nav:people", kind: "Go to", label: "People & roles", icon: UsersRound, view: "people", adminOnly: true },
];

function score(haystack, needle) {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const at = h.indexOf(n);
  if (at < 0) return -1;
  return at === 0 ? 0 : 1; // prefix matches sort above contains-matches
}

export default function CommandPalette({ open, onClose, onNavigate, jobs = [], employees = [], isAdmin }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim();
    const destinations = DESTINATIONS.filter((d) => !d.adminOnly || isAdmin);

    if (!q) {
      return [
        ...destinations,
        ...employees.slice(0, 4).map((e) => ({
          id: `emp:${e.id}`,
          kind: "Employee",
          label: e.name,
          meta: e.JobRole,
          icon: UserRound,
          view: "employees",
          focusId: e.id,
        })),
      ];
    }

    const matched = [];
    for (const d of destinations) {
      const s = score(d.label, q);
      if (s >= 0) matched.push({ ...d, _s: s });
    }
    for (const e of employees) {
      const s = Math.min(...[score(e.name || "", q), score(e.JobRole || "", q), score(e.email || "", q)].filter((x) => x >= 0), 9);
      if (s < 9) {
        matched.push({
          id: `emp:${e.id}`,
          kind: "Employee",
          label: e.name,
          meta: [e.JobRole, e.Department].filter(Boolean).join(" · "),
          icon: UserRound,
          view: "employees",
          focusId: e.id,
          _s: s + 2,
        });
      }
    }
    for (const j of jobs) {
      const s = Math.min(...[score(j.title || "", q), score(j.dept || "", q)].filter((x) => x >= 0), 9);
      if (s < 9) {
        matched.push({
          id: `job:${j.id}`,
          kind: "Role",
          label: j.title,
          meta: [j.dept, j.location].filter(Boolean).join(" · "),
          icon: ClipboardList,
          view: "recruitment",
          focusId: j.id,
          _s: s + 2,
        });
      }
    }
    return matched.sort((a, b) => a._s - b._s).slice(0, 24);
  }, [query, jobs, employees, isAdmin]);

  useEffect(() => setCursor(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  const choose = (item) => {
    if (!item) return;
    onNavigate?.(item.view, item.focusId ?? null);
    onClose?.();
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => (c + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => (c - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[cursor]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose?.();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-ink-950/75 backdrop-blur-[3px] animate-[fade_160ms_ease-out]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump to"
        className="panel relative w-full max-w-xl overflow-hidden animate-[rise_220ms_var(--ease-out-soft)_both]"
      >
        <div className="flex items-center gap-3 border-b border-ink-600 px-4">
          <Search className="h-4 w-4 shrink-0 text-mist-600" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search people, roles and sections"
            aria-label="Search people, roles and sections"
            aria-controls="cmdk-list"
            aria-activedescendant={results[cursor] ? `cmdk-${results[cursor].id}` : undefined}
            className="h-14 w-full bg-transparent text-[15px] text-paper outline-none placeholder:text-mist-600"
          />
          <kbd className="num hidden shrink-0 rounded-chip border border-ink-500 px-1.5 py-0.5 text-[10px] text-mist-500 sm:block">
            ESC
          </kbd>
        </div>

        <ul id="cmdk-list" ref={listRef} role="listbox" className="max-h-[46vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-mist-500">
              Nothing matches “{query}”.
            </li>
          ) : (
            results.map((item, i) => {
              const Icon = item.icon;
              const isActive = i === cursor;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    id={`cmdk-${item.id}`}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    onMouseMove={() => setCursor(i)}
                    onClick={() => choose(item)}
                    className={cx(
                      "flex w-full items-center gap-3 rounded-tile px-3 py-2.5 text-left transition-colors",
                      isActive ? "bg-ink-700" : "hover:bg-ink-800"
                    )}
                  >
                    <Icon
                      className={cx("h-4 w-4 shrink-0", isActive ? "text-brand-hi" : "text-mist-600")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-paper">{item.label}</span>
                      {item.meta ? (
                        <span className="block truncate text-[11px] text-mist-600">{item.meta}</span>
                      ) : null}
                    </span>
                    <span className="eyebrow shrink-0">{item.kind}</span>
                    {isActive ? (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-mist-500" aria-hidden="true" />
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

/** Registers the ⌘K / Ctrl-K shortcut. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return [open, setOpen];
}

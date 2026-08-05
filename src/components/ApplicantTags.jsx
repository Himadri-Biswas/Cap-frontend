/**
 * ApplicantTags — the visual signal an admin sees on a re-applying candidate.
 *
 * The tone carries the meaning, so it reads at a glance without being read:
 *   emerald = welcome back (former employee)     → POSITIVE
 *   sky     = already one of us (internal)       → POSITIVE
 *   rose    = we said no before                  → NEGATIVE
 *   slate   = neutral context (repeat applicant)
 *
 * Tags are computed on the server from employment and rejection history, so
 * nothing here is hand-assigned.
 */
import React from "react";
import { Ban, BadgeCheck, History, RotateCcw, ThumbsDown } from "lucide-react";
import { cx } from "../lib/cx.js";

export const TAG_META = {
  former_employee: {
    label: "Former employee",
    short: "Boomerang",
    icon: BadgeCheck,
    tone: "positive",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    solid: "border-emerald-300 bg-emerald-100 text-emerald-800",
    ring: "ring-emerald-200",
    description: "Worked here before and left in good standing.",
  },
  internal_candidate: {
    label: "Internal candidate",
    short: "Internal",
    icon: BadgeCheck,
    tone: "positive",
    className: "border-sky-200 bg-sky-50 text-sky-700",
    solid: "border-sky-300 bg-sky-100 text-sky-800",
    ring: "ring-sky-200",
    description: "Currently employed here and applying for a different role.",
  },
  previously_rejected: {
    label: "Previously rejected",
    short: "Re-applying",
    icon: ThumbsDown,
    tone: "negative",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    solid: "border-rose-300 bg-rose-100 text-rose-800",
    ring: "ring-rose-200",
    description: "Applied before and was rejected, now applying again.",
  },
  rehire_ineligible: {
    label: "Not rehire-eligible",
    short: "Blocked",
    icon: Ban,
    tone: "negative",
    className: "border-rose-300 bg-rose-100 text-rose-800",
    solid: "border-rose-400 bg-rose-200 text-rose-900",
    ring: "ring-rose-300",
    description: "Left the company and was flagged as not eligible for rehire.",
  },
  repeat_applicant: {
    label: "Repeat applicant",
    short: "Repeat",
    icon: RotateCcw,
    tone: "neutral",
    className: "border-slate-200 bg-slate-100 text-slate-600",
    solid: "border-slate-300 bg-slate-200 text-slate-700",
    ring: "ring-slate-200",
    description: "Has applied to this same job post before.",
  },
};

/** Sorted so the strongest signal is read first. */
const ORDER = ["former_employee", "internal_candidate", "rehire_ineligible", "previously_rejected", "repeat_applicant"];

export function sortTags(tags = []) {
  return ORDER.filter((t) => tags.includes(t));
}

/** The dominant tone of a candidate, used to tint their whole row/card. */
export function tagTone(tags = []) {
  if (tags.includes("rehire_ineligible") || tags.includes("previously_rejected")) {
    return tags.includes("former_employee") || tags.includes("internal_candidate") ? "mixed" : "negative";
  }
  if (tags.includes("former_employee") || tags.includes("internal_candidate")) return "positive";
  return "neutral";
}

export const TONE_ROW_CLASS = {
  positive: "bg-emerald-50/40 hover:bg-emerald-50/70",
  negative: "bg-rose-50/40 hover:bg-rose-50/70",
  mixed: "bg-amber-50/40 hover:bg-amber-50/70",
  neutral: "hover:bg-slate-50",
};

export const TONE_BAR_CLASS = {
  positive: "bg-emerald-500",
  negative: "bg-rose-500",
  mixed: "bg-amber-500",
  neutral: "bg-transparent",
};

export default function ApplicantTags({ tags = [], size = "sm", withIcon = true, className = "" }) {
  const visible = sortTags(tags);
  if (!visible.length) return null;

  return (
    <span className={cx("inline-flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((tag) => {
        const meta = TAG_META[tag];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <span
            key={tag}
            title={meta.description}
            className={cx(
              "inline-flex items-center gap-1 rounded-full border font-semibold",
              meta.className,
              size === "xs" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-[11px]"
            )}
          >
            {withIcon && <Icon className={size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5"} />}
            {size === "xs" ? meta.short : meta.label}
          </span>
        );
      })}
    </span>
  );
}

/** Compact "applied before on …" line for the candidate detail panel. */
export function LastAppliedNote({ application }) {
  if (!application?.lastAppliedAt) return null;
  const when = new Date(application.lastAppliedAt);
  return (
    <div className="mt-2 inline-flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        Last applied <span className="font-semibold text-slate-800">{when.toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
        {application.lastAppliedJobTitle ? ` for ${application.lastAppliedJobTitle}` : ""}
        {application.lastAppliedStatus ? (
          <>
            {" — outcome: "}
            <span
              className={cx(
                "font-semibold",
                application.lastAppliedStatus === "rejected" ? "text-rose-600" : "text-slate-800"
              )}
            >
              {application.lastAppliedStatus.replace(/_/g, " ")}
            </span>
          </>
        ) : null}
        {application.previousApplicationCount > 1
          ? ` · ${application.previousApplicationCount} previous applications`
          : ""}
      </span>
    </div>
  );
}

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
    className: "border-ok/35 bg-ok/12 text-ok",
    solid: "border-ok/35 bg-ok/12 text-ok",
    ring: "ring-ok/35",
    description: "Worked here before and left in good standing.",
  },
  internal_candidate: {
    label: "Internal candidate",
    short: "Internal",
    icon: BadgeCheck,
    tone: "positive",
    className: "border-brand/35 bg-brand/12 text-brand-hi",
    solid: "border-brand/45 bg-brand/18 text-brand-hi",
    ring: "ring-brand/35",
    description: "Currently employed here and applying for a different role.",
  },
  previously_rejected: {
    label: "Previously rejected",
    short: "Re-applying",
    icon: ThumbsDown,
    tone: "negative",
    className: "border-risk/35 bg-risk/12 text-risk",
    solid: "border-risk/35 bg-risk/12 text-risk",
    ring: "ring-risk/35",
    description: "Applied before and was rejected, now applying again.",
  },
  rehire_ineligible: {
    label: "Not rehire-eligible",
    short: "Blocked",
    icon: Ban,
    tone: "negative",
    className: "border-risk/35 bg-risk/12 text-risk",
    solid: "border-risk/45 bg-risk/20 text-risk",
    ring: "ring-risk/45",
    description: "Left the company and was flagged as not eligible for rehire.",
  },
  repeat_applicant: {
    label: "Repeat applicant",
    short: "Repeat",
    icon: RotateCcw,
    tone: "neutral",
    className: "border-ink-600 bg-ink-750 text-mist-400",
    solid: "border-ink-500 bg-ink-700 text-mist-200",
    ring: "ring-ink-500",
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
  positive: "bg-ok/10 hover:bg-ok/18",
  negative: "bg-risk/10 hover:bg-risk/18",
  mixed: "bg-raw/10 hover:bg-raw/18",
  neutral: "hover:bg-ink-750",
};

export const TONE_BAR_CLASS = {
  positive: "bg-ok",
  negative: "bg-risk",
  mixed: "bg-raw",
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
    <div className="mt-2 inline-flex items-start gap-2 rounded-tile border border-ink-600 bg-ink-800 px-3 py-2 text-xs text-mist-400">
      <History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" />
      <span>
        Last applied <span className="font-semibold text-paper">{when.toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
        {application.lastAppliedJobTitle ? ` for ${application.lastAppliedJobTitle}` : ""}
        {application.lastAppliedStatus ? (
          <>
            {" — outcome: "}
            <span
              className={cx(
                "font-semibold",
                application.lastAppliedStatus === "rejected" ? "text-risk" : "text-paper"
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

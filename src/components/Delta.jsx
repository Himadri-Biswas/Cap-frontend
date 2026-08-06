import React from "react";
import { cx } from "../lib/cx.js";

/**
 * The Delta rail — the one device this interface is built around.
 *
 * Every module in TalentPulse produces the same shape of answer: a
 * measurement, and the same measurement after a correction. A CV scored by
 * the biased model, then by the fair one. An employee's attrition risk, then
 * the risk after an intervention. So rather than three unrelated charts, all
 * three render through this: two hairline bars sharing a baseline, the
 * uncorrected reading in amber above the corrected one in aqua.
 *
 * Reading it takes no legend. The bars are the same length if nothing
 * changed, and the gap between their right-hand edges IS the delta.
 *
 * Colour is never the only carrier — each row is labelled, the figures are
 * printed, and the direction of change is stated in words for screen
 * readers.
 */

const TONE = {
  raw: { bar: "bg-raw", text: "text-raw", track: "bg-raw/10" },
  fair: { bar: "bg-fair", text: "text-fair", track: "bg-fair/10" },
  risk: { bar: "bg-risk", text: "text-risk", track: "bg-risk/10" },
  ok: { bar: "bg-ok", text: "text-ok", track: "bg-ok/10" },
  brand: { bar: "bg-brand", text: "text-brand-hi", track: "bg-brand/10" },
};

function Bar({ label, value, max, tone, format, index = 0 }) {
  const t = TONE[tone] || TONE.brand;
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-right text-[10px] uppercase tracking-wider text-mist-500">{label}</span>
      <div className={cx("h-2 flex-1 overflow-hidden rounded-full", t.track)}>
        <div
          className={cx("h-full rounded-full sweep", t.bar)}
          style={{ width: `${pct}%`, "--i": index }}
        />
      </div>
      <span className={cx("num w-16 shrink-0 text-right text-xs font-semibold", t.text)}>{format(value)}</span>
    </div>
  );
}

export default function Delta({
  title,
  meta,
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  beforeTone = "raw",
  afterTone = "fair",
  /** Lower is better for risk, higher is better for a match score. */
  lowerIsBetter = false,
  format = (v) => (typeof v === "number" ? v.toFixed(4) : "—"),
  max,
  index = 0,
  className = "",
  children,
}) {
  const ceiling = max ?? Math.max(before ?? 0, after ?? 0, 0.0001);
  const change = (after ?? 0) - (before ?? 0);
  const improved = lowerIsBetter ? change < -0.0005 : change > 0.0005;
  const worsened = lowerIsBetter ? change > 0.0005 : change < -0.0005;

  const direction = improved ? "improved" : worsened ? "moved down" : "unchanged";
  const sign = change > 0 ? "+" : "";

  return (
    <div className={cx("panel panel-sunken p-3.5", className)} style={{ "--i": index }}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-sm font-semibold text-paper">{title}</span>
        <span
          className={cx(
            "num rounded-chip px-1.5 py-0.5 text-[11px] font-semibold",
            improved ? "bg-ok/12 text-ok" : worsened ? "bg-raw/12 text-raw" : "bg-ink-700 text-mist-500"
          )}
        >
          {sign}
          {format(change)}
        </span>
        {/* Stated in words so the meaning survives without colour. */}
        <span className="sr-only">{direction}</span>
        {meta ? <span className="ml-auto truncate text-[11px] text-mist-500">{meta}</span> : null}
      </div>

      <div className="space-y-1.5">
        <Bar label={beforeLabel} value={before} max={ceiling} tone={beforeTone} format={format} index={index} />
        <Bar label={afterLabel} value={after} max={ceiling} tone={afterTone} format={format} index={index + 1} />
      </div>

      {children}
    </div>
  );
}

/**
 * The same reading at headline size, for a single hero figure such as an
 * employee's attrition risk.
 */
export function DeltaHero({
  label,
  value,
  previous,
  tone = "risk",
  suffix = "%",
  note,
  lowerIsBetter = true,
  /** Set when this sits on a dark feature panel rather than the chassis. */
  onFeature = false,
}) {
  const FEATURE_TONE = {
    risk: "text-[#ff7a8f]",
    raw: "text-[#f0b429]",
    ok: "text-[#34d399]",
    fair: "text-[#3ee0cd]",
    brand: "text-[#b9adff]",
  };
  const t = onFeature ? { text: FEATURE_TONE[tone] || FEATURE_TONE.risk } : TONE[tone] || TONE.risk;
  const change = previous != null ? value - previous : null;
  const improved = change != null && (lowerIsBetter ? change < 0 : change > 0);

  return (
    <div>
      <div className={cx("num text-[10px] font-medium uppercase tracking-[0.2em]", onFeature ? "feature-faint" : "text-mist-500")}>
        {label}
      </div>
      <div className="mt-1.5 flex items-end gap-3">
        <span className={cx("num display-xl text-[56px] tabular-nums", t.text)}>
          {typeof value === "number" ? value.toFixed(1) : "—"}
          <span className="text-2xl opacity-55">{suffix}</span>
        </span>
        {change != null && Math.abs(change) > 0.05 && (
          <span
            className={cx(
              "num mb-1.5 rounded-chip px-1.5 py-0.5 text-xs font-semibold",
              improved ? "bg-ok/12 text-ok" : "bg-risk/12 text-risk"
            )}
          >
            {change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}
            <span className="sr-only">{improved ? " improvement" : " increase"}</span>
          </span>
        )}
      </div>
      {note ? <div className={cx("mt-2 text-xs", onFeature ? "feature-dim" : "text-mist-500")}>{note}</div> : null}
    </div>
  );
}

/** A single meter with no comparison — for coverage, confidence, share. */
export function Meter({ label, value, max = 1, tone = "brand", format, index = 0, right }) {
  const t = TONE[tone] || TONE.brand;
  const pct = max > 0 ? Math.min(Math.max((value / max) * 100, 0), 100) : 0;
  return (
    <div className="flex items-center gap-3">
      {label ? <span className="w-28 shrink-0 truncate text-xs text-mist-400">{label}</span> : null}
      <div className={cx("h-1.5 flex-1 overflow-hidden rounded-full", t.track)}>
        <div className={cx("h-full rounded-full sweep", t.bar)} style={{ width: `${pct}%`, "--i": index }} />
      </div>
      <span className={cx("num w-12 shrink-0 text-right text-[11px] font-semibold", t.text)}>
        {right ?? (format ? format(value) : `${Math.round(pct)}%`)}
      </span>
    </div>
  );
}

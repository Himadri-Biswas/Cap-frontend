import React from "react";
import { cx } from "../../lib/cx.js";

/**
 * A small status marker.
 *
 * `tone` maps to the palette's semantics rather than to colours: `raw` is
 * always an uncorrected reading, `fair` a corrected one, `risk` attrition or
 * rejection. Callers that pass their own className still win, so existing
 * one-off styling keeps working.
 */
const TONE = {
  neutral: "border-ink-500 bg-ink-750 text-mist-200",
  quiet: "border-ink-600 bg-ink-800 text-mist-400",
  brand: "border-brand/35 bg-brand/12 text-brand-hi",
  raw: "border-raw/35 bg-raw/12 text-raw",
  fair: "border-fair/35 bg-fair/12 text-fair",
  risk: "border-risk/35 bg-risk/12 text-risk",
  ok: "border-ok/35 bg-ok/12 text-ok",
};

function Pill({ children, tone, className = "", ...props }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-[11px] font-medium",
        TONE[tone] || (tone ? TONE.neutral : ""),
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Pill;

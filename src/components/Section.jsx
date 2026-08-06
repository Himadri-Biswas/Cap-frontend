import React from "react";
import { Reveal, RuleIn, TextReveal } from "./Motion.jsx";
import { cx } from "../lib/cx.js";

/**
 * The editorial section template.
 *
 * One structure, used everywhere, in the order a reader actually needs it:
 *
 *   ┌ 04 ─── RESIDUAL BIAS ──────────────────────────────────────┐  eyebrow
 *   │ What's left after debiasing                                │  statement
 *   │                                                            │
 *   │ The same four factors measured again. The closer to zero…  │  lede
 *   └────────────────────────────────────────────────────────────┘
 *
 * Three deliberate choices:
 *
 * · The heading is a short declarative statement, never a label and never a
 *   question. "What's left after debiasing" tells you the finding; "Residual
 *   bias analysis" only tells you the topic.
 * · The eyebrow carries the sequence number and a one-word category, so the
 *   reader can see where they are in an eleven-stage report at a glance. The
 *   numbering is real — stage 4 only makes sense after 3 — so it is
 *   information, not decoration.
 * · The lede is capped at ~62 characters per line. Explanatory prose set to
 *   the full width of a dashboard is unreadable, however good the type is.
 */
export default function Section({
  step,
  kicker,
  title,
  lede,
  actions,
  children,
  className = "",
  bodyClassName = "",
  tone = "panel",
}) {
  return (
    <Reveal className={cx(tone === "bare" ? "" : "panel overflow-hidden", className)}>
      <header className={cx("px-6 pt-6", tone === "bare" && "px-0 pt-0")}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {(step != null || kicker) && (
              <div className="mb-3 flex items-center gap-3">
                {step != null && (
                  <span className="num text-[11px] font-medium tabular-nums text-brand">
                    {String(step).padStart(2, "0")}
                  </span>
                )}
                {kicker && (
                  <span className="num text-[10px] font-medium uppercase tracking-[0.2em] text-mist-500">
                    {kicker}
                  </span>
                )}
                <RuleIn className="h-px flex-1 bg-ink-600" />
              </div>
            )}

            <TextReveal as="h3" text={title} className="title-lg text-[clamp(19px,2.1vw,25px)]" />

            {lede && (
              <p className="mt-3 max-w-[62ch] text-[13.5px] leading-[1.65] text-mist-400">{lede}</p>
            )}
          </div>

          {actions ? <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div> : null}
        </div>
      </header>

      <div className={cx("px-6 pb-6 pt-5", tone === "bare" && "px-0 pb-0", bodyClassName)}>{children}</div>
    </Reveal>
  );
}

/**
 * The same intro without a panel around it — for the top of a page, where the
 * heading introduces everything below rather than one block.
 */
export function PageIntro({ kicker, title, lede, actions, className = "" }) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-6", className)}>
      <div className="min-w-0 max-w-2xl">
        {kicker && (
          <div className="mb-3 flex items-center gap-3">
            <span className="num text-[10px] font-medium uppercase tracking-[0.2em] text-mist-500">{kicker}</span>
            <RuleIn className="h-px w-16 bg-ink-600" />
          </div>
        )}
        <TextReveal as="h2" text={title} className="display-xl text-[clamp(26px,3.4vw,40px)] text-paper" />
        {lede && <p className="mt-4 max-w-[58ch] text-[14.5px] leading-[1.7] text-mist-400">{lede}</p>}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

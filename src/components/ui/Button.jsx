import React from "react";
import { cx } from "../../lib/cx.js";

/**
 * One button, four intents.
 *
 * `intent` says what the button means, not what colour it is — so a
 * destructive action reads the same everywhere without anyone re-picking a
 * rose from the palette. Sizes exist because dense tables need a smaller
 * target than a page-level action, but nothing drops below the 32px that
 * keeps a pointer honest.
 */
const INTENT = {
  primary:
    "bg-brand text-white font-semibold hover:bg-brand-hi active:translate-y-px " +
    "shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]",
  neutral:
    "bg-ink-700 text-paper border border-ink-500 hover:bg-ink-600 hover:border-ink-400 active:translate-y-px",
  quiet:
    "bg-transparent text-mist-200 border border-ink-600 hover:bg-ink-750 hover:text-paper hover:border-ink-400 active:translate-y-px",
  ghost: "bg-transparent text-mist-400 hover:bg-ink-750 hover:text-paper active:translate-y-px",
  danger:
    "bg-risk/12 text-risk border border-risk/35 hover:bg-risk/20 hover:border-risk/55 active:translate-y-px",
  positive:
    "bg-ok/12 text-ok border border-ok/35 hover:bg-ok/20 hover:border-ok/55 active:translate-y-px",
};

const SIZE = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export default function Button({
  className = "",
  type = "button",
  intent = "primary",
  size = "md",
  block = false,
  ...props
}) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center rounded-tile whitespace-nowrap",
        "transition-[background-color,border-color,color,transform] duration-150",
        "disabled:pointer-events-none disabled:opacity-45",
        INTENT[intent] || INTENT.primary,
        SIZE[size] || SIZE.md,
        block && "w-full",
        className
      )}
      {...props}
    />
  );
}

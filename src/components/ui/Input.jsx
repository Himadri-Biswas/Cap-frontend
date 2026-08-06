import React from "react";
import { cx } from "../../lib/cx.js";

export default function Input({ className = "", ...props }) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-tile border border-ink-600 bg-ink-850 px-3 text-sm text-paper",
        "outline-none transition-colors duration-150",
        "hover:border-ink-500 focus:border-brand/60 focus:bg-ink-800",
        "disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

/**
 * A labelled field. The label is always visible — a placeholder that
 * disappears the moment you type is not a label, and someone coming back to
 * a half-filled form has no way to tell what a box was for.
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  type = "text",
  className = "",
  id,
  ...props
}) {
  const inputId = id || `f-${label?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const hintId = hint || error ? `${inputId}-hint` : undefined;

  return (
    <label className={cx("block", className)} htmlFor={inputId}>
      <span className="eyebrow block">
        {label}
        {required && <span className="ml-1 text-brand">*</span>}
      </span>
      <Input
        id={inputId}
        type={type}
        aria-describedby={hintId}
        aria-invalid={error ? true : undefined}
        className={cx("mt-2", error && "border-risk/60 focus:border-risk")}
        {...props}
      />
      {(hint || error) && (
        <span id={hintId} className={cx("mt-1.5 block text-[11px]", error ? "text-risk" : "text-mist-500")}>
          {error || hint}
        </span>
      )}
    </label>
  );
}

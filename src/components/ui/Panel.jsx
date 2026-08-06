import React from "react";
import { cx } from "../../lib/cx.js";

/**
 * The layout unit. A titled hairline box on the chassis.
 *
 * Composed rather than configured: pass `title`/`caption`/`actions` for the
 * common case, or drop `<Panel.Head>` and `<Panel.Body>` in directly when a
 * section needs something the props don't cover. That keeps this from
 * growing a boolean for every variation anyone ever needs.
 */
export default function Panel({
  title,
  caption,
  actions,
  step,
  as: Tag = "section",
  tone = "default",
  className = "",
  bodyClassName = "",
  children,
  index,
  ...props
}) {
  const hasHead = title || caption || actions || step;
  return (
    <Tag
      className={cx(
        "panel",
        tone === "raised" && "panel-raised",
        tone === "sunken" && "panel-sunken",
        className
      )}
      style={index != null ? { "--i": index } : undefined}
      {...props}
    >
      {hasHead && (
        <PanelHead title={title} caption={caption} actions={actions} step={step} />
      )}
      <div className={cx(hasHead ? "p-4 pt-3.5" : "p-4", bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function PanelHead({ title, caption, actions, step, className = "" }) {
  return (
    <header className={cx("flex items-start justify-between gap-4 border-b border-ink-600 px-4 py-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {step != null && (
          <span className="num mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-chip bg-ink-700 px-1 text-[10px] font-semibold text-mist-400">
            {step}
          </span>
        )}
        <div className="min-w-0">
          {title ? <h3 className="title-md text-[15px]">{title}</h3> : null}
          {caption ? <p className="mt-1 text-xs leading-5 text-mist-500">{caption}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

Panel.Head = PanelHead;
Panel.Body = function PanelBody({ className = "", children }) {
  return <div className={cx("p-4", className)}>{children}</div>;
};

/**
 * A single measured figure. Used across the dashboard and the report
 * headers; the value is always mono so a column of them lines up.
 */
export function Stat({ label, value, unit, tone = "paper", hint, icon: Icon, index = 0 }) {
  const toneClass =
    { paper: "text-paper", raw: "text-raw", fair: "text-fair", risk: "text-risk", ok: "text-ok", brand: "text-brand-hi" }[
      tone
    ] || "text-paper";
  return (
    <div className="panel panel-hit p-4 enter" style={{ "--i": index }}>
      <div className="flex items-start justify-between gap-2">
        <span className="eyebrow">{label}</span>
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-mist-600" aria-hidden="true" /> : null}
      </div>
      <div className={cx("num mt-2 text-2xl font-semibold tracking-tight", toneClass)}>
        {value}
        {unit ? <span className="ml-0.5 text-sm font-normal opacity-55">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 text-[11px] leading-4 text-mist-500">{hint}</div> : null}
    </div>
  );
}

/** Empty and error states share a shape so the app reads consistently. */
export function EmptyState({ icon: Icon, title, body, action, tone = "neutral" }) {
  return (
    <div className="panel panel-sunken flex flex-col items-center px-6 py-12 text-center">
      {Icon ? (
        <span
          className={cx(
            "mb-3 flex h-11 w-11 items-center justify-center rounded-tile border",
            tone === "risk" ? "border-risk/30 bg-risk/10 text-risk" : "border-ink-600 bg-ink-800 text-mist-500"
          )}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : null}
      <div className="text-sm font-semibold text-paper">{title}</div>
      {body ? <p className="mt-1 max-w-sm text-xs leading-5 text-mist-500">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

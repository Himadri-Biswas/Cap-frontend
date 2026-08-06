import React from "react";
import { cx } from "../../lib/cx.js";

function SoftTag({ children, className = "" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-chip border border-ink-600 bg-ink-850 px-2 py-0.5 text-[11px] text-mist-200",
        className
      )}
    >
      {children}
    </span>
  );
}

export default SoftTag;

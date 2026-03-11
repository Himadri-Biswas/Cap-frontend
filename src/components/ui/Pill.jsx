import React from "react";
import { cx } from "../../lib/cx.js";

function Pill({ children, className = "" }) {
  return (
    <span className={cx("inline-flex items-center rounded-full px-3 py-1 text-xs", className)}>
      {children}
    </span>
  );
}

export default Pill;

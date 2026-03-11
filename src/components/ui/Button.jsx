import React from "react";
import { cx } from "../../lib/cx.js";

export default function Button({ className = "", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold text-white transition",
        className
      )}
      {...props}
    />
  );
}

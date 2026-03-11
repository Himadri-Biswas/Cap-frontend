import React from "react";
import { cx } from "../../lib/cx.js";

export default function Input({ className = "", ...props }) {
  return (
    <input
      className={cx(
        "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-indigo-300",
        className
      )}
      {...props}
    />
  );
}

import React from "react";

function SoftTag({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
      {children}
    </span>
  );
}

export default SoftTag;

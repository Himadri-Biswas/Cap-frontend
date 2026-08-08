import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cx } from "../../lib/cx.js";

/**
 * Centered dialog.
 *
 * Beyond scroll-lock and Escape, this traps Tab inside the dialog and hands
 * focus back to whatever opened it on close. Without that, a keyboard user
 * tabs straight out of an open dialog into the page behind it and has no way
 * of knowing where they are.
 */
export default function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }) {
  const panelRef = useRef(null);
  const returnFocusTo = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    returnFocusTo.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      panelRef.current?.querySelectorAll(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      ) || [];

    // Move focus in, so the first Tab lands somewhere sensible.
    requestAnimationFrame(() => {
      const first = focusables()[0];
      (first || panelRef.current)?.focus?.();
    });

    const onKey = (event) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...focusables()];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" }[size] || "max-w-2xl";
  const titleId = "dlg-title";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-ink-950/70 backdrop-blur-[3px] animate-[fade_200ms_ease-out]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          "panel relative my-auto w-full outline-none",
          "animate-[rise_260ms_var(--ease-out-soft)_both]",
          width
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-600 p-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold tracking-tight text-paper">
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 truncate text-sm text-mist-400">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-tile p-1.5 text-mist-500 transition hover:bg-ink-700 hover:text-paper"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">{children}</div>

        {footer ? <div className="border-t border-ink-600 p-4">{footer}</div> : null}
      </div>
    </div>
  );
}

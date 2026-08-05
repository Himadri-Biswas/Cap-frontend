/**
 * CvViewer — renders a stored CV in-page for whoever is allowed to see it.
 *
 * The bytes are fetched WITH the Clerk auth header and turned into a blob: URL,
 * so the <iframe> works without ever exposing a public file URL. PDFs and text
 * render natively; .docx (which no browser renders) falls back to the plain
 * text module 1 already extracted, with a download button as the last resort.
 * The blob URL is revoked on unmount so a long admin session does not leak
 * memory while flipping through candidates.
 */
import React, { useEffect, useState } from "react";
import { AlertCircle, Download, FileText, Loader2 } from "lucide-react";
import { api } from "../lib/api.js";
import { cx } from "../lib/cx.js";

export default function CvViewer({ fileId, filename, mimeType, height = "70vh", className = "" }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [meta, setMeta] = useState(null);
  const [text, setText] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fileId) return undefined;
    let cancelled = false;
    let created = null;

    setLoading(true);
    setError(null);
    setObjectUrl(null);
    setText(null);

    (async () => {
      try {
        const info = await api.files.meta(fileId).catch(() => null);
        if (cancelled) return;
        setMeta(info);

        const type = info?.mimeType || mimeType || "";
        if (type === "application/pdf" || type.startsWith("text/")) {
          created = await api.files.objectUrl(fileId);
          if (cancelled) {
            URL.revokeObjectURL(created);
            return;
          }
          setObjectUrl(created);
        } else {
          // Not browser-renderable — show the extracted text instead.
          const result = await api.files.text(fileId).catch(() => null);
          if (!cancelled) setText(result?.text || "");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load this CV.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [fileId, mimeType]);

  async function download() {
    try {
      const url = objectUrl || (await api.files.objectUrl(fileId));
      const a = document.createElement("a");
      a.href = url;
      a.download = meta?.originalName || filename || "cv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!objectUrl) setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err.message || "Download failed.");
    }
  }

  if (!fileId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No CV was attached to this application.
      </div>
    );
  }

  return (
    <div className={cx("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-600 shadow-sm">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">
              {meta?.originalName || filename || "Candidate CV"}
            </div>
            <div className="text-xs text-slate-500">
              {meta?.extension?.replace(".", "").toUpperCase() || "FILE"}
              {meta?.sizeBytes ? ` · ${Math.max(1, Math.round(meta.sizeBytes / 1024))} KB` : ""}
              {meta?.uploadedAt ? ` · uploaded ${new Date(meta.uploadedAt).toLocaleDateString()}` : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={download}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </button>
      </div>

      {loading && (
        <div
          className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white"
          style={{ height }}
        >
          <div className="flex flex-col items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
            Loading CV…
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
          <div className="text-sm text-rose-700">{error}</div>
        </div>
      )}

      {!loading && !error && objectUrl && (
        <iframe
          src={objectUrl}
          title={meta?.originalName || "Candidate CV"}
          className="w-full rounded-2xl border border-slate-200 bg-white"
          style={{ height }}
        />
      )}

      {!loading && !error && !objectUrl && text !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" style={{ maxHeight: height, overflowY: "auto" }}>
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Browsers cannot render {meta?.extension || "this format"} inline — showing the text extracted by the
            Module 1 parser. Use Download for the original file.
          </div>
          {text ? (
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-700">{text}</pre>
          ) : (
            <div className="text-sm text-slate-500">No text could be extracted from this file.</div>
          )}
        </div>
      )}
    </div>
  );
}

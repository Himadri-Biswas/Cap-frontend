/**
 * CvLibrary — the applicant's stored CVs, in one reusable block.
 *
 * The same component runs in two places: the one-time onboarding step right
 * after sign-up, and the "My profile" tab where CVs are managed later. Every
 * action writes to MongoDB the moment it happens — a pick uploads immediately
 * and module 1 parses the skills there and then, so applying to a job later is
 * only a choice from this list.
 */
import React, { useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Sparkles, Star, Trash2, Upload } from "lucide-react";
import { cx } from "../../lib/cx.js";
import { api, ApiError } from "../../lib/api.js";

export function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * `uploadOnly` renders just the "add" affordance with no list — used inside the
 * apply modal, where the list is already drawn as selectable rows above it.
 */
export default function CvLibrary({ cvs = [], onChange, compact = false, uploadOnly = false }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const inputRef = useRef(null);

  /**
   * One request per file, on purpose.
   *
   * Each upload runs the document through module 1 server-side, and batching
   * five of those into a single serverless invocation is how you hit the
   * function timeout on a cold ML Space. One file per request keeps every call
   * short, lets the list fill in as it goes, and means one slow document does
   * not lose the others.
   */
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setUploading(true);
    setError(null);
    setNotice(null);

    const failed = [];
    let warning = null;
    for (const [index, file] of files.entries()) {
      setProgress(files.length > 1 ? `${index + 1} of ${files.length}` : null);
      try {
        const formData = new FormData();
        formData.append("cvs", file);
        const data = await api.myCvs.upload(formData);
        onChange?.(data.cvs);
        if (data.warning) warning = data.warning;
      } catch (err) {
        failed.push(`${file.name}: ${err.message || "upload failed"}`);
      }
    }

    if (failed.length) setError(failed.join(" · "));
    else if (warning) setNotice(warning);
    setProgress(null);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run(fileId, action) {
    setBusyId(fileId);
    setError(null);
    setNotice(null);
    try {
      const data = await action();
      onChange?.(data.cvs);
    } catch (err) {
      // A CV attached to a live application is deliberately undeletable.
      setError(err instanceof ApiError && err.code === "cv_in_use" ? err.message : err.message || "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,.rtf,.odt,.md"
        aria-label="Choose CV files to upload"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploadOnly ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-tile border border-dashed border-ink-500 bg-ink-800 px-4 py-2.5 text-sm font-semibold text-mist-200 transition hover:border-brand/35 hover:bg-brand/12/40 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {uploading ? `Uploading${progress ? ` ${progress}` : ""}…` : "Upload a different CV"}
        </button>
      ) : cvs.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex w-full flex-col items-center justify-center rounded-tile border border-dashed border-ink-500 bg-ink-850 px-6 py-10 transition hover:border-brand/35 hover:bg-brand/12/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-tile bg-brand/12 text-brand-hi">
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
          </div>
          <div className="mt-3 text-sm font-semibold text-paper">
            {uploading ? `Uploading and reading your skills${progress ? ` (${progress})` : ""}…` : "Add your CVs"}
          </div>
          <div className="mt-3 rounded-full border border-ink-600 bg-ink-800 px-3 py-1 text-[11px] font-semibold text-mist-400">
            PDF, DOCX, DOC, TXT, RTF or ODT · up to 15 MB each
          </div>
        </button>
      ) : (
        <>
          <div className="space-y-2">
            {cvs.map((cv) => {
              const busy = busyId === cv.fileId;
              return (
                <div
                  key={cv.fileId}
                  className={cx(
                    "rounded-tile border p-3 transition",
                    cv.isDefault ? "border-brand/35 bg-brand/12/50" : "border-ink-600 bg-ink-800"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tile bg-ink-750 text-mist-400">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-paper">{cv.originalName}</span>
                        {cv.isDefault && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand/35 bg-ink-800 px-2 py-0.5 text-[10px] font-bold text-brand-hi">
                            <Star className="h-3 w-3 fill-current" aria-hidden="true" />
                            Default
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist-500">
                        <span>{formatFileSize(cv.sizeBytes)}</span>
                        <span>Added {new Date(cv.uploadedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
                        {cv.extractionStatus === "done" ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-ok">
                            <Sparkles className="h-3 w-3" aria-hidden="true" />
                            {cv.skillCount} skills read
                          </span>
                        ) : (
                          <span className="font-semibold text-raw">Skills not read yet</span>
                        )}
                      </div>

                      {!compact && cv.skills?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cv.skills.slice(0, 12).map((skill) => (
                            <span
                              key={skill}
                              className="rounded-full border border-ink-600 bg-ink-850 px-2 py-0.5 text-[10px] text-mist-400"
                            >
                              {skill}
                            </span>
                          ))}
                          {cv.skills.length > 12 && (
                            <span className="px-1 text-[10px] text-mist-600">+{cv.skills.length - 12} more</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-mist-600" aria-hidden="true" />
                      ) : (
                        <>
                          {!cv.isDefault && (
                            <button
                              type="button"
                              title="Use this CV by default when applying"
                              onClick={() => run(cv.fileId, () => api.myCvs.setDefault(cv.fileId))}
                              className="rounded-lg p-1.5 text-mist-600 transition hover:bg-ink-700 hover:text-brand-hi"
                            >
                              <Star className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            title="Remove this CV"
                            onClick={() => run(cv.fileId, () => api.myCvs.remove(cv.fileId))}
                            className="rounded-lg p-1.5 text-mist-600 transition hover:bg-risk/12 hover:text-risk"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-tile border border-dashed border-ink-500 bg-ink-800 px-4 py-2.5 text-sm font-semibold text-mist-200 transition hover:border-brand/35 hover:bg-brand/12/40 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {uploading ? `Uploading${progress ? ` ${progress}` : ""}…` : "Add another CV"}
          </button>
        </>
      )}

      {notice && (
        <div className="flex items-start gap-2 rounded-tile border border-raw/35 bg-raw/12 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-raw" aria-hidden="true" />
          <div className="text-xs text-raw">{notice}</div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-tile border border-risk/35 bg-risk/12 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-risk" aria-hidden="true" />
          <div className="text-xs text-risk">{error}</div>
        </div>
      )}

    </div>
  );
}

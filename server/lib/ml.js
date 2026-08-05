/**
 * ml.js — the ONLY place the server talks to the three ML backends.
 *
 * Every function here is a verbatim pass-through: the same URL, the same
 * method, the same body shape and the same response object the frontend
 * already sends/receives today. Nothing is renamed, reshaped or defaulted.
 * If a Space is cold or down these throw an MlError, and every caller treats
 * that as "persist what we have, skip the ML enrichment" — the DB layer must
 * never be able to break an inference.
 */
import { config } from "../config.js";

export class MlError extends Error {
  constructor(message, status = 502, service = "ml") {
    super(message);
    this.name = "MlError";
    this.status = status;
    this.service = service;
  }
}

async function call(service, url, init = {}, { timeoutMs = config.ml.timeoutMs } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new MlError(detail.detail || `${service} responded ${res.status}`, res.status, service);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof MlError) throw err;
    if (err.name === "AbortError") {
      throw new MlError(`${service} timed out after ${timeoutMs}ms (HF Space may be cold-starting)`, 504, service);
    }
    throw new MlError(err.message || `${service} unreachable`, 502, service);
  } finally {
    clearTimeout(timer);
  }
}

function fileForm(field, { buffer, filename, mimeType }) {
  const form = new FormData();
  form.append(field, new Blob([buffer], { type: mimeType || "application/octet-stream" }), filename);
  return form;
}

// ── MODULE 1 — skill extraction ─────────────────────────────────────────────

/** POST /extract-skills?mode=gliner  (multipart: file) */
export function extractSkillsFromFile({ buffer, filename, mimeType }) {
  return call(
    "module1-skills",
    `${config.ml.module1Skills}/extract-skills?mode=gliner`,
    { method: "POST", body: fileForm("file", { buffer, filename, mimeType }) }
  );
}

/** POST /extract-text  (json: {text}) */
export function extractSkillsFromText(text) {
  return call("module1-skills", `${config.ml.module1Skills}/extract-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

/** POST /read-file  (multipart: file) → {text} */
export function readFileText({ buffer, filename, mimeType }) {
  return call("module1-skills", `${config.ml.module1Skills}/read-file`, {
    method: "POST",
    body: fileForm("file", { buffer, filename, mimeType }),
  });
}

// ── MODULE 1 — ranking + debiasing ──────────────────────────────────────────

/** POST /rank-candidates/upload  (multipart: job_title, job_description, files[]) */
export function rankCandidates({ jobTitle, jobDescription, files }) {
  const form = new FormData();
  form.append("job_title", jobTitle || "Untitled Role");
  form.append("job_description", jobDescription || "");
  for (const f of files) {
    form.append("files", new Blob([f.buffer], { type: f.mimeType || "application/octet-stream" }), f.filename);
  }
  return call("module1-ranking", `${config.ml.module1Ranking}/rank-candidates/upload`, {
    method: "POST",
    body: form,
  });
}

// ── MODULE 2 — gap analysis + learning path ─────────────────────────────────

/** POST /analyze-text  (json: {resume_text, jd_text, level_hint, max_hours, max_budget}) */
export function analyzeLearningPath(payload) {
  return call("module2", `${config.ml.module2}/analyze-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// ── MODULE 3 — attrition + SHAP + DiCE ──────────────────────────────────────

/**
 * POST /infer  (json: the 34 raw IBM HR columns)
 * Returns {attrition_prob, attrition_pct, attrition_verdict, risk_tier,
 *          primary_reason, reason_probs{}, shap_base_value, shap_top5[], dice_plans[]}
 */
export function inferAttrition(features) {
  return call("module3", `${config.ml.module3}/infer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(features),
  });
}

export async function mlHealth() {
  const probe = async (name, url) => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      return { name, url, ok: res.ok, status: res.status };
    } catch (err) {
      return { name, url, ok: false, status: 0, error: err.message };
    }
  };
  return Promise.all([
    probe("module1-skills", `${config.ml.module1Skills}/`),
    probe("module1-ranking", `${config.ml.module1Ranking}/`),
    probe("module2", `${config.ml.module2}/health`),
    probe("module3", `${config.ml.module3}/`),
  ]);
}

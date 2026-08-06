/**
 * api.js — the single client for the TalentPulse data API (MongoDB + RBAC).
 *
 * This talks ONLY to our own server. The three ML backends are still called
 * directly from the feature components exactly as before — nothing here
 * touches VITE_API_URL, VITE_MODULE1_API_URL, VITE_MODULE1_RANKING_API_URL or
 * VITE_MODULE2_API_URL.
 */

const BASE = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");

/**
 * Clerk's getToken() is injected here by SessionProvider so non-React code
 * (and every call site) gets an authenticated request without threading hooks
 * through the component tree.
 */
let tokenGetter = async () => null;
export function setTokenGetter(fn) {
  tokenGetter = fn || (async () => null);
}

/** Local-demo header used only when the server runs with AUTH_DISABLED=true. */
let demoEmail = null;
export function setDemoEmail(email) {
  demoEmail = email || null;
}

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = "GET", body, formData, signal, raw = false } = {}) {
  const headers = {};
  const token = await tokenGetter().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (demoEmail) headers["x-demo-email"] = demoEmail;

  let payload;
  if (formData) {
    payload = formData; // let the browser set the multipart boundary
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload, signal });

  if (raw) return res;

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    throw new ApiError(
      data?.error || `Request failed (${res.status})`,
      res.status,
      data?.code,
      data?.details
    );
  }
  return data;
}

const qs = (params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const out = search.toString();
  return out ? `?${out}` : "";
};

export const api = {
  health: () => request("/health"),
  mlHealth: () => request("/health/ml"),

  // ── identity / RBAC ──────────────────────────────────────────────────────
  me: () => request("/me"),
  updateMe: (patch) => request("/me", { method: "PATCH", body: patch }),
  setActiveRole: (role) => request("/me/active-role", { method: "POST", body: { role } }),
  /** Marks the one-time post-sign-up profile step as done. */
  finishOnboarding: (profile) => request("/me/onboarding", { method: "POST", body: profile }),

  /**
   * The applicant's own CV library. Documents are uploaded once (normally at
   * sign-up), parsed by module 1 there and then, and reused on every
   * application — so applying is a pick from this list, not another upload.
   */
  myCvs: {
    list: () => request("/me/cvs"),
    upload: (formData) => request("/me/cvs", { method: "POST", formData }),
    rename: (fileId, label) => request(`/me/cvs/${fileId}`, { method: "PATCH", body: { label } }),
    setDefault: (fileId) => request(`/me/cvs/${fileId}/default`, { method: "POST" }),
    remove: (fileId) => request(`/me/cvs/${fileId}`, { method: "DELETE" }),
  },

  users: {
    list: (params) => request(`/users${qs(params)}`),
    get: (id) => request(`/users/${encodeURIComponent(id)}`),
    setRole: (id, payload) => request(`/users/${encodeURIComponent(id)}/roles`, { method: "POST", body: payload }),
    setStatus: (id, status) => request(`/users/${encodeURIComponent(id)}/status`, { method: "POST", body: { status } }),
    linkableEmployees: (params) => request(`/users/linkable/employees${qs(params)}`),
  },

  // ── module 1 ─────────────────────────────────────────────────────────────
  jobs: {
    list: (params) => request(`/jobs${qs(params)}`),
    get: (id) => request(`/jobs/${id}`),
    eligibility: (id) => request(`/jobs/${id}/eligibility`),
    create: (job) => request("/jobs", { method: "POST", body: job }),
    update: (id, patch) => request(`/jobs/${id}`, { method: "PATCH", body: patch }),
    /** Stop accepting applications. Reversible, and the applicant side sees it. */
    stop: (id) => request(`/jobs/${id}/stop`, { method: "POST" }),
    reopen: (id) => request(`/jobs/${id}/reopen`, { method: "POST" }),
    /** 409 `job_still_open` until the posting has been stopped. */
    remove: (id) => request(`/jobs/${id}`, { method: "DELETE" }),
  },

  applications: {
    listForJob: (jobId, params) => request(`/applications${qs({ jobId, ...params })}`),
    list: (params) => request(`/applications${qs(params)}`),
    mine: () => request("/applications/mine"),
    get: (applicationId) => request(`/applications/${applicationId}`),
    submit: (formData) => request("/applications", { method: "POST", formData }),
    setStatus: (applicationId, status, note) =>
      request(`/applications/${applicationId}/status`, { method: "PATCH", body: { status, note } }),
    update: (applicationId, patch) => request(`/applications/${applicationId}`, { method: "PATCH", body: patch }),
    reextract: (applicationId) => request(`/applications/${applicationId}/reextract`, { method: "POST" }),
    withdraw: (applicationId) => request(`/applications/${applicationId}/withdraw`, { method: "POST" }),
  },

  screening: {
    run: (formData) => request("/screening/run", { method: "POST", formData }),
    runFromJob: (payload) => request("/screening/run/from-job", { method: "POST", body: payload }),
    runs: (params) => request(`/screening/runs${qs(params)}`),
    getRun: (runId) => request(`/screening/runs/${runId}`),
  },

  // ── files ────────────────────────────────────────────────────────────────
  files: {
    /** Relative URL — pass through `authedFileUrl()` before putting it in src. */
    url: (fileId, download = false) => `${BASE}/api/files/${fileId}${download ? "?download=1" : ""}`,
    meta: (fileId) => request(`/files/${fileId}/meta`),
    text: (fileId) => request(`/files/${fileId}/text`),
    /** Fetches the bytes WITH the auth header and returns a blob: URL. */
    async objectUrl(fileId) {
      const res = await request(`/files/${fileId}`, { raw: true });
      if (!res.ok) throw new ApiError("Could not load the file.", res.status);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    },
  },

  // ── module 3 ─────────────────────────────────────────────────────────────
  employees: {
    list: (params) => request(`/employees${qs(params)}`),
    facets: () => request("/employees/facets"),
    get: (employeeNumber) => request(`/employees/${employeeNumber}`),
    analysis: (employeeNumber, refresh = false) =>
      request(`/employees/${employeeNumber}/analysis${qs({ refresh: refresh || undefined })}`),
    saveAnalysis: (employeeNumber, result) =>
      request(`/employees/${employeeNumber}/analysis`, { method: "POST", body: result }),
    events: (employeeNumber) => request(`/employees/${employeeNumber}/events`),
    create: (employee) => request("/employees", { method: "POST", body: employee }),
    update: (employeeNumber, patch) => request(`/employees/${employeeNumber}`, { method: "PATCH", body: patch }),
    offboard: (employeeNumber, payload) =>
      request(`/employees/${employeeNumber}/offboard`, { method: "POST", body: payload }),
  },

  attrition: {
    actionableFeatures: () => request("/attrition/actionable-features"),
    apply: (employeeNumber, payload) => request(`/attrition/${employeeNumber}/apply`, { method: "POST", body: payload }),
    /**
     * Apply every action in a plan together. The model runs once on the final
     * state, so the probability returned is the one the plan predicted — not
     * the partial result of applying its actions one at a time.
     */
    applyPlan: (employeeNumber, payload) =>
      request(`/attrition/${employeeNumber}/apply-plan`, { method: "POST", body: payload }),
    revert: (employeeNumber) => request(`/attrition/${employeeNumber}/revert`, { method: "POST" }),
    topRisk: (limit = 5) => request(`/attrition/top-risk${qs({ limit })}`),
    distribution: () => request("/attrition/distribution"),
    events: (limit) => request(`/attrition/events${qs({ limit })}`),
    get: (employeeNumber) => request(`/attrition/${employeeNumber}`),
  },

  // ── module 2 ─────────────────────────────────────────────────────────────
  upskilling: {
    analyze: (payload) => request("/upskilling/analyze", { method: "POST", body: payload }),
    paths: (params) => request(`/upskilling/paths${qs(params)}`),
    path: (pathId) => request(`/upskilling/paths/${pathId}`),
    assign: (pathId, payload) => request(`/upskilling/paths/${pathId}/assign`, { method: "POST", body: payload }),
    setProgress: (pathId, courseId, patch) =>
      request(`/upskilling/progress/${pathId}/${courseId}`, { method: "PATCH", body: patch }),
  },

  // ── notifications / dashboard ────────────────────────────────────────────
  notifications: {
    list: (params) => request(`/notifications${qs(params)}`),
    markRead: (id) => request(`/notifications/${id}/read`, { method: "POST" }),
    markAllRead: () => request("/notifications/read-all", { method: "POST" }),
    dismiss: (id) => request(`/notifications/${id}/dismiss`, { method: "POST" }),
    create: (payload) => request("/notifications", { method: "POST", body: payload }),
  },

  dashboard: () => request("/dashboard"),
};

export default api;

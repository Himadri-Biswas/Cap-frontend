/**
 * config.js — single source of truth for every environment value the server
 * needs. Reads .env.local first (git-ignored, where your real secrets live)
 * then falls back to .env, so `npm run dev` and the db:* scripts behave the
 * same way.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

for (const file of [".env.local", ".env"]) {
  const full = path.join(ROOT, file);
  if (fs.existsSync(full)) dotenv.config({ path: full, override: false, quiet: true });
}

const bool = (v, fallback = false) =>
  v === undefined ? fallback : ["1", "true", "yes", "on"].includes(String(v).toLowerCase());

const list = (v) =>
  String(v || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 5050),
  nodeEnv: process.env.NODE_ENV || "development",

  // ── MongoDB ───────────────────────────────────────────────────────────────
  mongoUri: process.env.MONGO_URI || "",
  // Reuses the module-3 database your teammate already populated so live
  // attrition writes land on the very documents his HF backend reads.
  dbName: process.env.MONGO_DB_NAME || "IBM_HR_Analytics",
  gridFsBucket: process.env.GRIDFS_BUCKET || "cvs",

  // ── Clerk ─────────────────────────────────────────────────────────────────
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY || "",
  // Any Clerk account signing in with one of these emails is granted `admin`
  // automatically on first sync — this is how you bootstrap the very first admin.
  adminEmails: list(process.env.ADMIN_EMAILS),
  // Escape hatch for offline demos: skips Clerk token verification and trusts
  // the x-demo-email header. NEVER enable outside local development.
  authDisabled: bool(process.env.AUTH_DISABLED, false),

  // ── ML backends (URLs only — request/response contracts are never touched) ─
  ml: {
    module1Skills: (process.env.MODULE1_API_URL || process.env.VITE_MODULE1_API_URL || "https://ijsasif-module-1-skill-extractor.hf.space").replace(/\/$/, ""),
    module1Ranking: (process.env.MODULE1_RANKING_API_URL || process.env.VITE_MODULE1_RANKING_API_URL || "https://ijsasif-module-1-ranking-debiasing.hf.space").replace(/\/$/, ""),
    module2: (process.env.MODULE2_API_URL || process.env.VITE_MODULE2_API_URL || "https://rafatkabir-talent-matching-api.hf.space").replace(/\/$/, ""),
    module3: (process.env.MODULE3_API_URL || process.env.VITE_API_URL || "https://himadribiswas-talentpulse-backend.hf.space").replace(/\/$/, ""),
    timeoutMs: Number(process.env.ML_TIMEOUT_MS || 120000),
  },

  // ── Business rules ────────────────────────────────────────────────────────
  reapplyCooldownHours: Number(process.env.REAPPLY_COOLDOWN_HOURS || 24),
  attritionNotifyTopN: Number(process.env.ATTRITION_NOTIFY_TOP_N || 5),
  attritionNotifyThreshold: Number(process.env.ATTRITION_NOTIFY_THRESHOLD || 0.5),
  maxCvBytes: Number(process.env.MAX_CV_BYTES || 15 * 1024 * 1024),
  allowedCvExtensions: [".pdf", ".docx", ".doc", ".txt", ".rtf", ".odt", ".md"],
  allowedCvMimeTypes: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "text/plain",
    "text/markdown",
    "application/rtf",
    "text/rtf",
    "application/vnd.oasis.opendocument.text",
    "application/octet-stream",
  ],

  corsOrigins: list(process.env.CORS_ORIGINS).length
    ? String(process.env.CORS_ORIGINS).split(",").map((s) => s.trim())
    : ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173"],
};

export function assertMongoUri() {
  if (!config.mongoUri) {
    console.error(
      "\n  MONGO_URI is not set.\n" +
        "  Create Cap-frontend/.env.local and add your Atlas connection string:\n\n" +
        '      MONGO_URI="mongodb+srv://<user>:<pass>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"\n\n' +
        "  See `what to do.md` (Part 1) for click-by-click instructions.\n"
    );
    process.exit(1);
  }
}

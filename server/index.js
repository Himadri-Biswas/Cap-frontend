/**
 * index.js — the TalentPulse data API.
 *
 * This server sits BESIDE the three ML backends, never in front of them in a
 * way that changes their contracts. It owns MongoDB, Clerk-backed RBAC and CV
 * storage; the HuggingFace Spaces keep owning inference.
 *
 *   npm run dev     → this API on :5050 + Vite on :5173 (proxied)
 *   npm start       → this API alone
 */
import express from "express";
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { HttpError } from "./middleware/auth.js";
import { mlHealth } from "./lib/ml.js";

import meRoutes from "./routes/me.js";
import userRoutes from "./routes/users.js";
import jobRoutes from "./routes/jobs.js";
import applicationRoutes from "./routes/applications.js";
import fileRoutes from "./routes/files.js";
import employeeRoutes from "./routes/employees.js";
import attritionRoutes from "./routes/attrition.js";
import notificationRoutes from "./routes/notifications.js";
import upskillingRoutes from "./routes/upskilling.js";
import screeningRoutes from "./routes/screening.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

// ── CORS (hand-rolled: one small middleware beats another dependency) ───────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (config.corsOrigins.includes(origin) || config.corsOrigins.includes("*"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,x-demo-email,x-clerk-auth-token"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Clerk session parsing ──────────────────────────────────────────────────
// Mounted only when a secret key exists so the API still boots (and the health
// endpoint still answers) while you are halfway through the Clerk setup.
if (config.clerkSecretKey) {
  const { clerkMiddleware } = await import("@clerk/express");
  app.use(clerkMiddleware({ secretKey: config.clerkSecretKey, publishableKey: config.clerkPublishableKey }));
} else if (!config.authDisabled) {
  console.warn(
    "  CLERK_SECRET_KEY is not set — every authenticated route will return 401.\n" +
      "  Follow Part 2 of `what to do.md`, or set AUTH_DISABLED=true for an offline demo."
  );
}

// ── Health ─────────────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  const { mongoose } = await import("./db.js");
  res.json({
    status: "ok",
    service: "talentpulse-data-api",
    mongo: {
      connected: mongoose.connection.readyState === 1,
      database: config.dbName,
    },
    clerk: { configured: !!config.clerkSecretKey, authDisabled: config.authDisabled },
    adminEmails: config.adminEmails.length,
  });
});

app.get("/api/health/ml", async (_req, res) => {
  res.json({ backends: await mlHealth() });
});

// ── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/me", meRoutes);
app.use("/api/users", userRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/attrition", attritionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/upskilling", upskillingRoutes);
app.use("/api/screening", screeningRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use("/api", (_req, res) => res.status(404).json({ error: "Unknown endpoint." }));

// ── Error handling ─────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;

  if (err.name === "MulterError") {
    return res.status(400).json({
      error: err.code === "LIMIT_FILE_SIZE"
        ? `File too large. The limit is ${(config.maxCvBytes / 1048576).toFixed(0)}MB.`
        : err.message,
      code: err.code,
    });
  }
  if (err.name === "MlError") {
    return res.status(err.status || 502).json({
      error: err.message,
      code: "ml_unavailable",
      service: err.service,
    });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ error: err.message, code: "validation_error" });
  }
  if (err.code === 11000) {
    return res.status(409).json({ error: "That record already exists.", code: "duplicate_key", keyValue: err.keyValue });
  }

  if (status >= 500) console.error("[api]", err);
  res.status(status).json({
    error: err.message || "Internal server error.",
    code: err.code || undefined,
    details: err.details || undefined,
  });
});

// ── Boot ───────────────────────────────────────────────────────────────────
const server = await connectDb()
  .then(() =>
    app.listen(config.port, () => {
      console.log(`  TalentPulse data API listening on http://localhost:${config.port}`);
      console.log(`  Health: http://localhost:${config.port}/api/health`);
    })
  )
  .catch((err) => {
    console.error("\n  Could not start the API — MongoDB connection failed:\n ", err.message, "\n");
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server?.close(() => process.exit(0));
  });
}

export default app;

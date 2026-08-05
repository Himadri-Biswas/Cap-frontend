/**
 * auth.js — Clerk session verification + MongoDB role enforcement.
 *
 * Two layers, deliberately separate:
 *   1. Clerk proves WHO the caller is (verified session token).
 *   2. MongoDB decides WHAT they may do (`users.roles`).
 * A user could tamper with anything client-side and still not gain a role,
 * because the role is read from the database on every single request.
 */
import { getAuth, clerkClient } from "@clerk/express";
import { config } from "../config.js";
import { User } from "../models/index.js";
import { syncUser, clerkProfile } from "../lib/userSync.js";

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Resolves req.user from the Clerk session. Does NOT reject anonymous callers —
 * use `requireAuth` for that. Public endpoints can still personalise if a
 * session happens to be present.
 */
export async function resolveUser(req) {
  if (req.appUser !== undefined) return req.appUser;
  req.appUser = null;

  // ── Local demo escape hatch (AUTH_DISABLED=true) ────────────────────────
  if (config.authDisabled) {
    const email = String(req.get("x-demo-email") || "").toLowerCase().trim();
    if (email) {
      req.appUser = await syncUser(`demo_${email.replace(/[^a-z0-9]/g, "_")}`, { email });
    }
    return req.appUser;
  }

  if (!config.clerkSecretKey) return null;

  let auth = null;
  try {
    auth = getAuth(req);
  } catch {
    return null;
  }
  if (!auth?.userId) return null;

  // Fast path: we already know this Clerk id.
  const existing = await User.findOne({ clerkUserId: auth.userId });
  if (existing) {
    // Refresh the login stamp at most once a minute to avoid a write per request.
    const stale = !existing.lastLoginAt || Date.now() - existing.lastLoginAt.getTime() > 60_000;
    if (stale) {
      existing.lastLoginAt = new Date();
      existing.normalise();
      await existing.save();
    }
    req.appUser = existing;
    return existing;
  }

  // First request from a brand-new Clerk account: pull the profile and sync.
  const clerkUser = await clerkClient.users.getUser(auth.userId);
  req.appUser = await syncUser(auth.userId, clerkProfile(clerkUser));
  return req.appUser;
}

/** Populates req.user when a session exists; never rejects. */
export function withUser(req, _res, next) {
  resolveUser(req)
    .then((user) => {
      req.user = user;
      next();
    })
    .catch(next);
}

/** 401 unless a valid session maps to an active MongoDB user. */
export function requireAuth(req, _res, next) {
  resolveUser(req)
    .then((user) => {
      if (!user) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
      if (user.status === "suspended") throw new HttpError(403, "This account is suspended.", "suspended");
      req.user = user;
      next();
    })
    .catch(next);
}

/** 403 unless the signed-in user holds at least one of `roles`. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    resolveUser(req)
      .then((user) => {
        if (!user) throw new HttpError(401, "Sign in to continue.", "unauthenticated");
        if (user.status === "suspended") throw new HttpError(403, "This account is suspended.", "suspended");
        if (!roles.some((r) => user.roles.includes(r))) {
          throw new HttpError(403, `Requires role: ${roles.join(" or ")}.`, "forbidden");
        }
        req.user = user;
        next();
      })
      .catch(next);
  };
}

export const requireAdmin = requireRole("admin");

/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * User — collection `users`. The RBAC source of truth.
 *
 * DESIGN: one human = one email = one Clerk account = one User document that
 * holds a SET of roles, not a single role. That is what makes the
 * "room cleaner who later applies for ML Engineer" case work without a second
 * email: the person keeps `employee` and simply also holds `applicant`, and
 * switches context with `activeRole`. Clerk only ever stores credentials —
 * authorisation is decided here, in MongoDB, exactly as requested
 * ("admin will be selected by role: admin from mongoDB").
 */
import mongoose from "mongoose";

export const ROLES = ["applicant", "employee", "admin"];

const roleHistorySchema = new mongoose.Schema(
  {
    _id: false,
    role: { type: String, enum: ROLES },
    action: { type: String, enum: ["granted", "revoked"] },
    at: { type: Date, default: Date.now },
    by: String, // clerkUserId of the acting admin ("system" for bootstrap)
    byEmail: String,
    reason: String,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    clerkUserId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },

    firstName: String,
    lastName: String,
    fullName: String,
    imageUrl: String,

    // ── RBAC ────────────────────────────────────────────────────────────────
    // Everyone starts as `applicant`. An admin grants `employee` / `admin`.
    roles: {
      type: [{ type: String, enum: ROLES }],
      default: ["applicant"],
      index: true,
    },
    // Which hat the person is currently wearing in the UI. Must be a member of
    // `roles`; the server clamps it on every read.
    activeRole: { type: String, enum: ROLES, default: "applicant" },
    roleHistory: { type: [roleHistorySchema], default: [] },

    // ── Employee linkage (only meaningful when roles includes "employee") ───
    employeeNumber: { type: Number, index: true, sparse: true },
    employmentStatus: {
      type: String,
      enum: ["none", "active", "former", "on_leave"],
      default: "none",
      index: true,
    },
    jobTitle: String,
    department: String,

    // ── Applicant profile (module 1) ───────────────────────────────────────
    phone: String,
    location: String,
    headline: String,
    yearsExperience: Number,
    linkedinUrl: String,
    portfolioUrl: String,
    skills: { type: [String], default: [] },
    // Most recent CV, reused to pre-fill new applications
    defaultCvFileId: { type: mongoose.Schema.Types.ObjectId },
    defaultCvFilename: String,

    // ── Account state ──────────────────────────────────────────────────────
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    lastLoginAt: Date,
    onboardedAt: Date,
    notificationsReadAt: Date,
  },
  { timestamps: true, collection: "users", minimize: false }
);

userSchema.virtual("isAdmin").get(function () {
  return this.roles?.includes("admin");
});

/** Normalises roles/activeRole so the client never sees an impossible combo. */
userSchema.methods.normalise = function () {
  const unique = [...new Set(this.roles?.length ? this.roles : ["applicant"])];
  // An admin and an employee can always also act as an applicant.
  if (!unique.includes("applicant")) unique.push("applicant");
  this.roles = ROLES.filter((r) => unique.includes(r));
  if (!this.roles.includes(this.activeRole)) {
    this.activeRole = this.roles.includes("admin")
      ? "admin"
      : this.roles.includes("employee")
        ? "employee"
        : "applicant";
  }
  return this;
};

userSchema.methods.toPublic = function () {
  return {
    id: String(this._id),
    clerkUserId: this.clerkUserId,
    email: this.email,
    firstName: this.firstName || "",
    lastName: this.lastName || "",
    fullName: this.fullName || [this.firstName, this.lastName].filter(Boolean).join(" ") || this.email,
    imageUrl: this.imageUrl || "",
    roles: this.roles,
    activeRole: this.activeRole,
    isAdmin: this.roles.includes("admin"),
    employeeNumber: this.employeeNumber ?? null,
    employmentStatus: this.employmentStatus,
    jobTitle: this.jobTitle || "",
    department: this.department || "",
    phone: this.phone || "",
    location: this.location || "",
    headline: this.headline || "",
    yearsExperience: this.yearsExperience ?? null,
    linkedinUrl: this.linkedinUrl || "",
    portfolioUrl: this.portfolioUrl || "",
    skills: this.skills || [],
    defaultCvFileId: this.defaultCvFileId ? String(this.defaultCvFileId) : null,
    defaultCvFilename: this.defaultCvFilename || "",
    status: this.status,
    createdAt: this.createdAt,
    lastLoginAt: this.lastLoginAt,
  };
};

export const User = mongoose.model("User", userSchema);

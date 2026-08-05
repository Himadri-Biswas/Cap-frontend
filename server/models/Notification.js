/**
 * Notification — collection `notifications`.
 *
 * Powers the admin bell in the Topbar. The headline case is the standing
 * "top 5 attrition-risk employees" alert: those are regenerated from the
 * `predictions` collection whenever a prediction changes, and de-duplicated
 * through `dedupeKey` so an employee who stays at the top of the leaderboard
 * produces ONE notification that gets updated, not a new row every refresh.
 */
import mongoose from "mongoose";

export const NOTIFICATION_TYPES = [
  "attrition_risk", // employee entered the top-N risk list
  "attrition_improved", // a live intervention lowered someone's risk
  "new_application", // an applicant submitted a CV
  "former_employee_applied", // POSITIVE re-application signal
  "rejected_reapplied", // NEGATIVE re-application signal
  "role_change", // an account was promoted / demoted
  "screening_complete", // a fair-screening run finished
  "system",
];

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    severity: { type: String, enum: ["critical", "high", "medium", "low", "info"], default: "info", index: true },

    title: { type: String, required: true },
    body: { type: String, default: "" },

    /** Role-wide fan-out (e.g. every admin) … */
    audienceRole: { type: String, enum: ["admin", "employee", "applicant", null], default: "admin", index: true },
    /** … or a single account, when targetUserId is set. */
    targetUserId: { type: String, index: true, default: null },

    entity: {
      kind: { type: String, enum: ["employee", "application", "job", "user", "screening_run", "learning_path", null], default: null },
      id: String,
      label: String,
    },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    /** Deep-link hint for the frontend: which view to open on click. */
    actionView: { type: String, default: null }, // "employees" | "recruitment" | "upskilling" | "people"
    actionId: { type: String, default: null },

    /** Stable identity for a recurring alert; upserted rather than duplicated.
     *  Its index is declared once below as unique+sparse. */
    dedupeKey: { type: String },

    read: { type: Boolean, default: false, index: true },
    readAt: Date,
    readBy: { type: [String], default: [] },
    dismissed: { type: Boolean, default: false, index: true },
    rank: Number, // 1..N for leaderboard-style alerts
  },
  { timestamps: true, collection: "notifications", minimize: false }
);
notificationSchema.index({ audienceRole: 1, dismissed: 1, createdAt: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

export const Notification = mongoose.model("Notification", notificationSchema);

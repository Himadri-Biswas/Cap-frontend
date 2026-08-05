/**
 * /api/notifications — the bell in the Topbar.
 *
 * An admin sees the role-wide feed (top-5 attrition risks, new applications,
 * former-employee re-applications); everyone else sees only notifications
 * addressed to them personally.
 */
import { Router } from "express";
import { requireAuth, requireAdmin, asyncHandler, HttpError } from "../middleware/auth.js";
import { Notification } from "../models/index.js";
import { refreshAttritionNotifications } from "../lib/attrition.js";

const router = Router();

function audienceFilter(user) {
  return user.roles.includes("admin")
    ? { $or: [{ audienceRole: "admin" }, { targetUserId: user.clerkUserId }] }
    : { targetUserId: user.clerkUserId };
}

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { includeDismissed = "false", limit = 50, type } = req.query;

    // Keep the standing attrition leaderboard honest on open, but never let a
    // refresh failure break the bell.
    if (req.user.roles.includes("admin") && req.query.refresh !== "false") {
      await refreshAttritionNotifications().catch(() => {});
    }

    const filter = { ...audienceFilter(req.user) };
    if (includeDismissed !== "true") filter.dismissed = false;
    if (type) filter.type = type;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ read: 1, severity: 1, rank: 1, createdAt: -1 })
        .limit(Math.min(Number(limit), 200))
        .lean(),
      Notification.countDocuments({ ...audienceFilter(req.user), dismissed: false, read: false }),
    ]);

    res.json({
      notifications: notifications.map((n) => ({ ...n, id: String(n._id) })),
      unreadCount,
    });
  })
);

router.post(
  "/:id/read",
  requireAuth,
  asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);
    if (!notification) throw new HttpError(404, "Notification not found.");
    notification.read = true;
    notification.readAt = new Date();
    if (!notification.readBy.includes(req.user.clerkUserId)) notification.readBy.push(req.user.clerkUserId);
    await notification.save();
    res.json({ ok: true });
  })
);

router.post(
  "/read-all",
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
      { ...audienceFilter(req.user), read: false, dismissed: false },
      { $set: { read: true, readAt: new Date() }, $addToSet: { readBy: req.user.clerkUserId } }
    );
    res.json({ ok: true, updated: result.modifiedCount });
  })
);

router.post(
  "/:id/dismiss",
  requireAuth,
  asyncHandler(async (req, res) => {
    await Notification.updateOne({ _id: req.params.id }, { $set: { dismissed: true, read: true } });
    res.json({ ok: true });
  })
);

/** Admin: raise a manual announcement. */
router.post(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { title, body = "", severity = "info", audienceRole = "admin", targetUserId = null } = req.body || {};
    if (!title) throw new HttpError(400, "title is required.");
    const notification = await Notification.create({
      type: "system",
      title,
      body,
      severity,
      audienceRole: targetUserId ? null : audienceRole,
      targetUserId,
    });
    res.status(201).json({ notification });
  })
);

export default router;

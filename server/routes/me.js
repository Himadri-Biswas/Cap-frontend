/**
 * /api/me — the signed-in identity, roles and role switching.
 *
 * This is the endpoint the frontend calls immediately after Clerk reports a
 * session. Its `activeRole` decides which portal the user lands on, which is
 * how "one unified login portal, everyone routed to their own page" works.
 */
import { Router } from "express";
import { requireAuth, asyncHandler, HttpError } from "../middleware/auth.js";
import { Employee, Application, Notification, LearningPath } from "../models/index.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user;
    const payload = user.toPublic();

    // Cheap counters the portals show as badges.
    const [applicationCount, unreadNotifications, learningPathCount] = await Promise.all([
      Application.countDocuments({ clerkUserId: user.clerkUserId }),
      user.roles.includes("admin")
        ? Notification.countDocuments({ audienceRole: "admin", read: false, dismissed: false })
        : Notification.countDocuments({ targetUserId: user.clerkUserId, read: false, dismissed: false }),
      LearningPath.countDocuments({ clerkUserId: user.clerkUserId }),
    ]);

    let employee = null;
    if (user.employeeNumber) {
      employee = await Employee.findOne({ EmployeeNumber: user.employeeNumber })
        .select("EmployeeNumber id name initials JobRole Department joined workMode location manager skills employmentStatus")
        .lean();
    }

    res.json({ user: payload, employee, counts: { applicationCount, unreadNotifications, learningPathCount } });
  })
);

/** Update the user's own profile fields (never roles — those are admin-only). */
router.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const editable = [
      "firstName",
      "lastName",
      "phone",
      "location",
      "headline",
      "yearsExperience",
      "linkedinUrl",
      "portfolioUrl",
      "skills",
    ];
    for (const key of editable) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key];
    }
    req.user.fullName =
      [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || req.user.email;
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  })
);

/**
 * Switch the hat the user is wearing.
 *
 * This is the answer to "a room cleaner who later applies for ML Engineer":
 * the person keeps ONE Clerk account and one email, holds both `employee` and
 * `applicant` in `roles`, and flips `activeRole` to apply. No second sign-up,
 * no duplicate email, no lost employment history — and their application still
 * carries the `internal_candidate` tag because the employee link is intact.
 */
router.post(
  "/active-role",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { role } = req.body || {};
    if (!req.user.roles.includes(role)) {
      throw new HttpError(403, `You do not hold the "${role}" role.`, "role_not_held");
    }
    req.user.activeRole = role;
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  })
);

export default router;

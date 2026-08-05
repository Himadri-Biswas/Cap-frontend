/**
 * /api/users — admin-only people management (promotion / demotion).
 *
 * Roles are additive sets, so "promote to current employee" never destroys the
 * applicant identity; it grants `employee` alongside it and links an
 * EmployeeNumber. Demotion revokes a role but keeps `applicant`, so nobody is
 * ever locked out of the product entirely.
 */
import { Router } from "express";
import { requireAdmin, asyncHandler, HttpError } from "../middleware/auth.js";
import { User, Employee, AuditLog, Notification, ROLES } from "../models/index.js";

const router = Router();

router.get(
  "/",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { q = "", role, status, limit = 100, skip = 0 } = req.query;
    const filter = {};
    if (q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ email: rx }, { fullName: rx }, { firstName: rx }, { lastName: rx }];
    }
    if (role && ROLES.includes(role)) filter.roles = role;
    if (status) filter.status = status;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(Number(skip)).limit(Math.min(Number(limit), 500)),
      User.countDocuments(filter),
    ]);

    res.json({ users: users.map((u) => u.toPublic()), total });
  })
);

router.get(
  "/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      $or: [{ clerkUserId: req.params.id }, { email: req.params.id.toLowerCase() }],
    });
    if (!user) throw new HttpError(404, "User not found.");
    const employee = user.employeeNumber
      ? await Employee.findOne({ EmployeeNumber: user.employeeNumber }).lean()
      : null;
    res.json({ user: user.toPublic(), roleHistory: user.roleHistory, employee });
  })
);

/**
 * Grant or revoke a role.
 * body: {role: "employee"|"admin"|"applicant", action: "grant"|"revoke",
 *        employeeNumber?: number, reason?: string}
 */
router.post(
  "/:id/roles",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { role, action = "grant", employeeNumber, reason = "" } = req.body || {};
    if (!ROLES.includes(role)) throw new HttpError(400, `role must be one of ${ROLES.join(", ")}.`);
    if (!["grant", "revoke"].includes(action)) throw new HttpError(400, "action must be grant or revoke.");

    const user = await User.findOne({
      $or: [{ clerkUserId: req.params.id }, { email: String(req.params.id).toLowerCase() }],
    });
    if (!user) throw new HttpError(404, "User not found.");

    const before = { roles: [...user.roles], employeeNumber: user.employeeNumber };

    if (action === "grant") {
      if (!user.roles.includes(role)) user.roles.push(role);

      // Promoting someone to `employee` must attach a real employee record,
      // otherwise module 3 has nothing to analyse for them.
      if (role === "employee") {
        if (employeeNumber != null) {
          const emp = await Employee.findOne({ EmployeeNumber: Number(employeeNumber) });
          if (!emp) throw new HttpError(404, `No employee with EmployeeNumber ${employeeNumber}.`);
          const claimedBy = await User.findOne({
            employeeNumber: Number(employeeNumber),
            clerkUserId: { $ne: user.clerkUserId },
          }).lean();
          if (claimedBy) {
            throw new HttpError(409, `EmployeeNumber ${employeeNumber} is already linked to ${claimedBy.email}.`);
          }
          user.employeeNumber = emp.EmployeeNumber;
          user.jobTitle = emp.JobRole || user.jobTitle;
          user.department = emp.Department || user.department;
          emp.clerkUserId = user.clerkUserId;
          emp.userEmail = user.email;
          emp.employmentStatus = "active";
          if (!emp.email) emp.email = user.email;
          if (!emp.name) emp.name = user.fullName;
          await emp.save();
        }
        user.employmentStatus = "active";
      }
    } else {
      if (role === "applicant") {
        throw new HttpError(400, "The applicant role is the baseline and cannot be revoked.");
      }
      if (role === "admin") {
        const adminCount = await User.countDocuments({ roles: "admin", status: "active" });
        if (adminCount <= 1 && user.roles.includes("admin")) {
          throw new HttpError(400, "Cannot revoke the last remaining admin.");
        }
      }
      user.roles = user.roles.filter((r) => r !== role);
      if (role === "employee") {
        // The person left: keep the employee row but flip it to `former`, which
        // is exactly what earns them the POSITIVE re-application tag later.
        if (user.employeeNumber) {
          await Employee.updateOne(
            { EmployeeNumber: user.employeeNumber },
            { $set: { employmentStatus: "former", exitDate: new Date(), exitReason: reason || "Role revoked by admin" } }
          );
        }
        user.employmentStatus = "former";
      }
    }

    user.roleHistory.push({
      role,
      action: action === "grant" ? "granted" : "revoked",
      by: req.user.clerkUserId,
      byEmail: req.user.email,
      reason,
    });
    user.normalise();
    await user.save();

    await Promise.all([
      AuditLog.create({
        action: `user.role.${action}`,
        actorUserId: req.user.clerkUserId,
        actorEmail: req.user.email,
        actorRole: "admin",
        entityKind: "user",
        entityId: user.clerkUserId,
        summary: `${action === "grant" ? "Granted" : "Revoked"} "${role}" for ${user.email}`,
        before,
        after: { roles: [...user.roles], employeeNumber: user.employeeNumber },
      }),
      Notification.create({
        type: "role_change",
        severity: "info",
        title: action === "grant" ? `You are now a ${role}` : `Your ${role} access was removed`,
        body: reason || `Updated by ${req.user.email}.`,
        audienceRole: null,
        targetUserId: user.clerkUserId,
        entity: { kind: "user", id: user.clerkUserId, label: user.email },
      }),
    ]);

    res.json({ user: user.toPublic() });
  })
);

/** Suspend / reactivate an account without touching Clerk. */
router.post(
  "/:id/status",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!["active", "suspended"].includes(status)) throw new HttpError(400, "status must be active or suspended.");
    const user = await User.findOne({
      $or: [{ clerkUserId: req.params.id }, { email: String(req.params.id).toLowerCase() }],
    });
    if (!user) throw new HttpError(404, "User not found.");
    if (user.clerkUserId === req.user.clerkUserId) throw new HttpError(400, "You cannot suspend your own account.");
    user.status = status;
    await user.save();
    await AuditLog.create({
      action: "user.status",
      actorUserId: req.user.clerkUserId,
      actorEmail: req.user.email,
      entityKind: "user",
      entityId: user.clerkUserId,
      summary: `Set ${user.email} to ${status}`,
    });
    res.json({ user: user.toPublic() });
  })
);

/** Employees available to link when promoting someone to `employee`. */
router.get(
  "/linkable/employees",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { q = "", limit = 50 } = req.query;
    const filter = { $or: [{ clerkUserId: { $exists: false } }, { clerkUserId: null }] };
    if (q.trim()) {
      const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$and = [{ $or: [{ name: rx }, { email: rx }, { JobRole: rx }] }];
    }
    const employees = await Employee.find(filter)
      .select("EmployeeNumber id name email JobRole Department employmentStatus")
      .sort({ EmployeeNumber: 1 })
      .limit(Math.min(Number(limit), 200))
      .lean();
    res.json({ employees });
  })
);

export default router;

/**
 * userSync.js — reconciles a Clerk identity with the MongoDB `users` document
 * that actually decides authorisation.
 *
 * Clerk owns credentials (email + password). MongoDB owns roles. This function
 * is the bridge, run on every authenticated request (cheaply — it upserts and
 * only writes when something changed).
 *
 * Bootstrap rule: an email listed in ADMIN_EMAILS is granted `admin` the first
 * time it signs in. That is how the very first admin exists without anyone
 * being able to edit the database by hand.
 */
import { config } from "../config.js";
import { User, Employee } from "../models/index.js";

/** Pull the primary email + name off a Clerk user object (SDK shape). */
export function clerkProfile(clerkUser) {
  if (!clerkUser) return null;
  const primaryId = clerkUser.primaryEmailAddressId;
  const emails = clerkUser.emailAddresses || [];
  const primary = emails.find((e) => e.id === primaryId) || emails[0];
  return {
    email: (primary?.emailAddress || "").toLowerCase().trim(),
    firstName: clerkUser.firstName || "",
    lastName: clerkUser.lastName || "",
    imageUrl: clerkUser.imageUrl || "",
  };
}

/**
 * Upsert the MongoDB user for a signed-in Clerk account and return it.
 * `profile` is {email, firstName, lastName, imageUrl}.
 */
export async function syncUser(clerkUserId, profile) {
  const email = (profile?.email || "").toLowerCase().trim();
  if (!clerkUserId || !email) return null;

  let user = await User.findOne({ clerkUserId });

  // Same person, new Clerk account (e.g. they deleted and re-registered):
  // adopt the existing record by email so their roles and history survive.
  if (!user) {
    const byEmail = await User.findOne({ email });
    if (byEmail) {
      byEmail.clerkUserId = clerkUserId;
      user = byEmail;
    }
  }

  if (!user) {
    user = new User({
      clerkUserId,
      email,
      roles: ["applicant"],
      activeRole: "applicant",
      onboardedAt: new Date(),
    });
  }

  user.email = email;
  if (profile.firstName) user.firstName = profile.firstName;
  if (profile.lastName) user.lastName = profile.lastName;
  if (profile.imageUrl) user.imageUrl = profile.imageUrl;
  user.fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || email;
  user.lastLoginAt = new Date();

  // ── Bootstrap admin from ADMIN_EMAILS ────────────────────────────────────
  if (config.adminEmails.includes(email) && !user.roles.includes("admin")) {
    user.roles = [...new Set([...user.roles, "admin"])];
    user.activeRole = "admin";
    user.roleHistory.push({
      role: "admin",
      action: "granted",
      by: "system",
      byEmail: "ADMIN_EMAILS",
      reason: "Bootstrapped from the ADMIN_EMAILS environment variable",
    });
  }

  // ── Auto-link an employee record that shares this email ──────────────────
  if (!user.employeeNumber) {
    const emp = await Employee.findOne({
      $or: [{ email }, { userEmail: email }],
    })
      .select("EmployeeNumber JobRole Department employmentStatus")
      .lean();
    if (emp) {
      user.employeeNumber = emp.EmployeeNumber;
      user.jobTitle = emp.JobRole || user.jobTitle;
      user.department = emp.Department || user.department;
      user.employmentStatus = emp.employmentStatus || "active";
      if (emp.employmentStatus === "active" && !user.roles.includes("employee")) {
        user.roles = [...new Set([...user.roles, "employee"])];
        user.roleHistory.push({
          role: "employee",
          action: "granted",
          by: "system",
          byEmail: "auto-link",
          reason: `Matched employees.EmployeeNumber=${emp.EmployeeNumber} by email`,
        });
      }
    }
  }

  user.normalise();
  await user.save();

  // Keep the employee row pointing back at the login.
  if (user.employeeNumber) {
    await Employee.updateOne(
      { EmployeeNumber: user.employeeNumber },
      { $set: { clerkUserId: user.clerkUserId, userEmail: user.email } }
    );
  }

  return user;
}

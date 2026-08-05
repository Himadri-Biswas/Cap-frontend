/**
 * npm run db:make-admin -- someone@example.com [--role employee] [--revoke]
 *
 * Grants (or revokes) a role directly in MongoDB. This is the "role: admin
 * from mongoDB" switch, and it is how the FIRST admin is created — after that
 * an admin can promote anyone from the People screen in the UI.
 *
 * The account does NOT have to exist yet: if you run this before the person
 * signs up in Clerk, a placeholder user is written and their Clerk id is
 * attached automatically the first time they sign in with that email.
 */
import { connectDb, closeDb } from "../db.js";
import { User, Employee, ROLES } from "../models/index.js";

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

async function main() {
  const email = process.argv.slice(2).find((a) => a.includes("@"))?.toLowerCase().trim();
  const role = String(arg("role") || "admin");
  const revoke = process.argv.includes("--revoke");
  const employeeNumber = arg("employee-number");

  if (!email) {
    console.error("\n  Usage: npm run db:make-admin -- someone@example.com [--role employee] [--revoke]\n");
    process.exit(1);
  }
  if (!ROLES.includes(role)) {
    console.error(`\n  --role must be one of: ${ROLES.join(", ")}\n`);
    process.exit(1);
  }

  await connectDb();

  let user = await User.findOne({ email });
  if (!user) {
    if (revoke) {
      console.log(`\n  No user with email ${email}. Nothing to revoke.\n`);
      await closeDb();
      return;
    }
    // Placeholder: adopted on first sign-in by syncUser(), which matches on email.
    user = new User({
      clerkUserId: `pending_${email.replace(/[^a-z0-9]/g, "_")}`,
      email,
      roles: ["applicant"],
      activeRole: "applicant",
    });
    console.log(`\n  No account for ${email} yet — creating a pending record.`);
    console.log("  It will bind to their Clerk account automatically on first sign-in.");
  }

  if (revoke) {
    if (role === "applicant") {
      console.error("\n  The applicant role is the baseline and cannot be revoked.\n");
      process.exit(1);
    }
    if (role === "admin") {
      const admins = await User.countDocuments({ roles: "admin" });
      if (admins <= 1 && user.roles.includes("admin")) {
        console.error("\n  Refusing to revoke the last remaining admin.\n");
        process.exit(1);
      }
    }
    user.roles = user.roles.filter((r) => r !== role);
    user.roleHistory.push({ role, action: "revoked", by: "cli", byEmail: "db:make-admin", reason: "CLI" });
  } else {
    if (!user.roles.includes(role)) user.roles.push(role);
    user.roleHistory.push({ role, action: "granted", by: "cli", byEmail: "db:make-admin", reason: "CLI" });
    if (role === "admin") user.activeRole = "admin";

    if (role === "employee") {
      let emp = null;
      if (employeeNumber && employeeNumber !== true) {
        emp = await Employee.findOne({ EmployeeNumber: Number(employeeNumber) });
        if (!emp) {
          console.error(`\n  No employee with EmployeeNumber ${employeeNumber}.\n`);
          process.exit(1);
        }
      } else {
        emp = await Employee.findOne({ $or: [{ email }, { userEmail: email }] });
      }
      if (emp) {
        user.employeeNumber = emp.EmployeeNumber;
        user.jobTitle = emp.JobRole;
        user.department = emp.Department;
        user.employmentStatus = "active";
        emp.clerkUserId = user.clerkUserId;
        emp.userEmail = email;
        emp.employmentStatus = "active";
        await emp.save();
        console.log(`  Linked to employee #${emp.EmployeeNumber} (${emp.name || emp.JobRole}).`);
      } else {
        console.log("  !  No matching employee record. Pass --employee-number <N> to link one.");
      }
    }
  }

  user.normalise();
  await user.save();

  console.log(`\n  ${email}`);
  console.log(`  roles:      ${user.roles.join(", ")}`);
  console.log(`  activeRole: ${user.activeRole}`);
  if (user.employeeNumber) console.log(`  employee:   #${user.employeeNumber}`);
  console.log("");

  await closeDb();
}

main().catch(async (err) => {
  console.error("\n  Failed:", err.message, "\n");
  await closeDb();
  process.exit(1);
});

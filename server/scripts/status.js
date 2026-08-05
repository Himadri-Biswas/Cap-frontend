/**
 * npm run db:status
 *
 * A one-screen answer to "is my database actually set up?" — collection
 * counts, admin accounts, prediction coverage and ML backend reachability.
 * Run this first whenever something looks wrong.
 */
import { connectDb, closeDb, mongoose } from "../db.js";
import { config } from "../config.js";
import {
  Employee, Job, Application, User, Prediction, ShapExplanation, Intervention,
  AttritionEvent, LearningPath, CourseProgress, Notification, CvFile, ScreeningRun, AuditLog,
} from "../models/index.js";
import { mlHealth } from "../lib/ml.js";

const row = (label, value) => console.log(`    ${label.padEnd(24)} ${value}`);

async function main() {
  console.log("\n  TalentPulse — database status\n");
  await connectDb();
  console.log(`  Cluster database: ${config.dbName}\n`);

  const counts = await Promise.all([
    Employee.countDocuments({}),
    Employee.countDocuments({ employmentStatus: "active" }),
    Employee.countDocuments({ employmentStatus: "former" }),
    Job.countDocuments({}),
    Application.countDocuments({}),
    User.countDocuments({}),
    User.countDocuments({ roles: "admin" }),
    User.countDocuments({ roles: "employee" }),
    Prediction.countDocuments({}),
    ShapExplanation.countDocuments({}),
    Intervention.countDocuments({}),
    AttritionEvent.countDocuments({}),
    LearningPath.countDocuments({}),
    CourseProgress.countDocuments({}),
    Notification.countDocuments({ dismissed: false }),
    CvFile.countDocuments({ deleted: false }),
    ScreeningRun.countDocuments({}),
    AuditLog.countDocuments({}),
  ]);

  const [
    employees, active, former, jobs, applications, users, admins, employeeUsers,
    predictions, shap, interventions, events, paths, progress, notifications,
    cvFiles, runs, audits,
  ] = counts;

  console.log("  MODULE 3 — attrition");
  row("employees", `${employees}  (${active} active, ${former} former)`);
  row("predictions", `${predictions}  (${employees ? Math.round((predictions / employees) * 100) : 0}% coverage)`);
  row("shap_explanations", shap);
  row("interventions", interventions);
  row("attrition_events", events);

  console.log("\n  MODULE 1 — recruitment");
  row("jobs", jobs);
  row("applications", applications);
  row("cv_files (GridFS)", cvFiles);
  row("screening_runs", runs);

  console.log("\n  MODULE 2 — upskilling");
  row("learning_paths", paths);
  row("course_progress", progress);

  console.log("\n  RBAC");
  row("users", users);
  row("admins", admins || "0  ← run npm run db:make-admin");
  row("employee accounts", employeeUsers);

  console.log("\n  OTHER");
  row("notifications (open)", notifications);
  row("audit_logs", audits);

  if (admins) {
    const adminList = await User.find({ roles: "admin" }).select("email roles clerkUserId").lean();
    console.log("\n  Admin accounts:");
    for (const a of adminList) {
      const pending = a.clerkUserId?.startsWith("pending_") ? "  (pending first sign-in)" : "";
      console.log(`    - ${a.email}${pending}`);
    }
  }

  console.log("\n  ML backends:");
  for (const backend of await mlHealth()) {
    console.log(`    ${backend.ok ? "up  " : "DOWN"}  ${backend.name.padEnd(16)} ${backend.url}`);
  }

  const stats = await mongoose.connection.db.stats().catch(() => null);
  if (stats) {
    console.log(`\n  Storage: ${(stats.dataSize / 1048576).toFixed(1)}MB data, ${(stats.indexSize / 1048576).toFixed(1)}MB indexes`);
  }
  console.log("");

  await closeDb();
}

main().catch(async (err) => {
  console.error("\n  Status check failed:", err.message, "\n");
  await closeDb();
  process.exit(1);
});

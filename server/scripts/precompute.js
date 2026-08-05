/**
 * npm run db:precompute [-- --limit 200 --concurrency 4 --force]
 *
 * Fills `predictions`, `shap_explanations` and `interventions` by calling
 * module 3's `/infer` for employees that have no cached analysis yet.
 *
 * Resumable by design: it only ever picks up employees still missing a
 * prediction, so you can stop it with Ctrl-C, run it again tomorrow, and it
 * carries on. Failures are counted, not fatal — a cold HuggingFace Space just
 * means those employees get computed on the next pass (or lazily, the first
 * time an admin opens them).
 */
import { connectDb, closeDb } from "../db.js";
import { config } from "../config.js";
import { Employee, Prediction } from "../models/index.js";
import { inferAttrition } from "../lib/ml.js";
import { buildFeaturePayload, persistInference, refreshAttritionNotifications } from "../lib/attrition.js";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : true;
}

const LIMIT = Number(arg("limit", 0)) || 0;
const CONCURRENCY = Math.max(1, Math.min(Number(arg("concurrency", 4)) || 4, 12));
const FORCE = process.argv.includes("--force");

async function main() {
  console.log("\n  TalentPulse — precompute attrition analysis\n");
  console.log(`  Module 3 backend: ${config.ml.module3}`);
  await connectDb();

  // Warm the Space first: a cold start can take a minute, and hitting it with
  // four parallel requests while it boots just produces four timeouts.
  process.stdout.write("  Warming up the ML backend… ");
  try {
    const probe = await Employee.findOne({}).lean();
    if (probe) await inferAttrition(buildFeaturePayload(probe));
    console.log("ready");
  } catch (err) {
    console.log(`failed (${err.message})`);
    console.log("  The Space may be asleep. It usually wakes within a minute — retrying anyway.\n");
  }

  let targets;
  if (FORCE) {
    targets = await Employee.find({}).sort({ EmployeeNumber: 1 }).lean();
  } else {
    const done = new Set((await Prediction.find({}).select("EmployeeNumber").lean()).map((p) => p.EmployeeNumber));
    targets = (await Employee.find({}).sort({ EmployeeNumber: 1 }).lean()).filter(
      (e) => !done.has(e.EmployeeNumber)
    );
  }
  if (LIMIT) targets = targets.slice(0, LIMIT);

  if (!targets.length) {
    console.log("  Every employee already has a cached analysis. Nothing to do.\n");
    await closeDb();
    return;
  }

  console.log(`  ${targets.length} employees to process (concurrency ${CONCURRENCY})\n`);

  let done = 0;
  let failed = 0;
  const startedAt = Date.now();
  const failures = [];

  // A simple worker pool: N workers pulling from one shared cursor keeps the
  // Space at a steady load instead of bursting.
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const employee = targets[cursor];
      cursor += 1;
      try {
        const result = await inferAttrition(buildFeaturePayload(employee));
        await persistInference(employee.EmployeeNumber, result, { source: "precompute" });
        done += 1;
      } catch (err) {
        failed += 1;
        if (failures.length < 10) failures.push(`#${employee.EmployeeNumber}: ${err.message}`);
      }
      const processed = done + failed;
      const rate = processed / ((Date.now() - startedAt) / 1000);
      const remaining = rate > 0 ? Math.round((targets.length - processed) / rate) : 0;
      process.stdout.write(
        `\r  ${processed}/${targets.length}  ok:${done}  failed:${failed}  ~${Math.floor(remaining / 60)}m${remaining % 60}s left   `
      );
    }
  }

  const stop = () => {
    console.log("\n\n  Interrupted — progress is saved. Re-run to continue where you left off.\n");
    closeDb().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log("\n");
  if (failures.length) {
    console.log("  Sample failures:");
    for (const f of failures) console.log(`    - ${f}`);
    console.log("");
  }

  const alerts = await refreshAttritionNotifications().catch(() => 0);
  console.log(`  Done: ${done} computed, ${failed} failed in ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`  Admin notifications refreshed: ${alerts} high-risk employees flagged\n`);

  if (failed) console.log("  Re-run `npm run db:precompute` to retry the failures.\n");

  await closeDb();
}

main().catch(async (err) => {
  console.error("\n  Precompute failed:", err.message, "\n");
  await closeDb();
  process.exit(1);
});

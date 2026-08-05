/**
 * npm run db:sync
 *
 * Pushes the schema to MongoDB Atlas: creates every collection, builds every
 * index declared on the models, and installs the GridFS bucket. Safe to run as
 * many times as you like — creating a collection that exists is a no-op and
 * `syncIndexes()` only issues the difference.
 *
 * You never edit anything in the Atlas UI. Change a model file, run this, done.
 */
import { connectDb, closeDb, mongoose } from "../db.js";
import { config } from "../config.js";
import * as models from "../models/index.js";
import { AppSetting } from "../models/index.js";

const DEFAULT_SETTINGS = [
  {
    key: "reapplyCooldownHours",
    value: config.reapplyCooldownHours,
    label: "Re-apply cooldown (hours)",
    description: "How long an applicant must wait before re-applying to the same job post.",
  },
  {
    key: "attritionNotifyTopN",
    value: config.attritionNotifyTopN,
    label: "Attrition alert size",
    description: "How many of the riskiest employees appear in the admin notification list.",
  },
  {
    key: "attritionNotifyThreshold",
    value: config.attritionNotifyThreshold,
    label: "Attrition alert threshold",
    description: "Minimum attrition probability (0-1) before an employee can raise an alert.",
  },
  {
    key: "allowedCvExtensions",
    value: config.allowedCvExtensions,
    label: "Accepted CV formats",
    description: "File extensions the applicant upload form accepts.",
  },
];

const MODEL_ORDER = [
  "User",
  "Job",
  "Application",
  "CvFile",
  "ScreeningRun",
  "Employee",
  "Prediction",
  "ShapExplanation",
  "Intervention",
  "AttritionEvent",
  "LearningPath",
  "CourseProgress",
  "Notification",
  "AuditLog",
  "AppSetting",
  "Counter",
];

async function main() {
  console.log("\n  TalentPulse — schema sync\n");
  await connectDb();
  const db = mongoose.connection.db;

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  for (const name of MODEL_ORDER) {
    const Model = models[name];
    if (!Model) continue;
    const collection = Model.collection.collectionName;

    if (!existing.has(collection)) {
      await db.createCollection(collection).catch((err) => {
        if (err.codeName !== "NamespaceExists") throw err;
      });
      console.log(`  + created  ${collection}`);
    } else {
      console.log(`    exists   ${collection}`);
    }

    // syncIndexes builds anything missing and drops indexes the model no
    // longer declares, so the cluster always matches the code.
    const changes = await Model.syncIndexes().catch(async (err) => {
      // A pre-existing index with different options (e.g. one your teammate
      // created by hand) cannot be silently replaced — report and continue.
      console.log(`    !  index conflict on ${collection}: ${err.message}`);
      return [];
    });
    if (changes?.length) console.log(`      indexes rebuilt: ${changes.join(", ")}`);
  }

  // GridFS buckets are created lazily by the driver; touching them here means
  // `cvs.files` / `cvs.chunks` show up in Atlas right after the first sync.
  for (const suffix of ["files", "chunks"]) {
    const name = `${config.gridFsBucket}.${suffix}`;
    if (!existing.has(name)) {
      await db.createCollection(name).catch(() => {});
      console.log(`  + created  ${name}  (GridFS)`);
    }
  }
  await db
    .collection(`${config.gridFsBucket}.chunks`)
    .createIndex({ files_id: 1, n: 1 }, { unique: true })
    .catch(() => {});
  await db.collection(`${config.gridFsBucket}.files`).createIndex({ filename: 1, uploadDate: 1 }).catch(() => {});

  // Seed tunable settings without overwriting values an admin already changed.
  for (const setting of DEFAULT_SETTINGS) {
    await AppSetting.updateOne(
      { key: setting.key },
      { $setOnInsert: setting },
      { upsert: true }
    );
  }

  console.log(`\n  Schema is in sync with ${config.dbName}.`);
  console.log("  Next: npm run db:seed\n");
  await closeDb();
}

main().catch(async (err) => {
  console.error("\n  Schema sync failed:", err.message, "\n");
  await closeDb();
  process.exit(1);
});

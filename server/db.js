/**
 * db.js — Mongoose connection + GridFS bucket used for CV binaries.
 */
import mongoose from "mongoose";
import { config, assertMongoUri } from "./config.js";

let bucket = null;

export async function connectDb({ quiet = false } = {}) {
  assertMongoUri();
  if (mongoose.connection.readyState === 1) return mongoose.connection;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongoUri, {
    dbName: config.dbName,
    serverSelectionTimeoutMS: 20000,
    maxPoolSize: 10,
  });

  bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: config.gridFsBucket,
  });

  if (!quiet) {
    const host = mongoose.connection.host || "atlas";
    console.log(`  MongoDB connected → ${host}/${config.dbName}`);
  }
  return mongoose.connection;
}

export function getBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: config.gridFsBucket,
    });
  }
  return bucket;
}

export async function closeDb() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

export { mongoose };

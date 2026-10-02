import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import mongoose from 'mongoose';
import { bootstrapDb } from '../../src/db/index.js';

/** the MongoDB version Atlas runs on its free tier */
export const MONGODB_VERSION = '8.0.32';

/** the first run downloads the MongoDB binary, which can take a while */
export const START_TIMEOUT_MS = 180_000;

/**
 * starts a one-member replica set, so transactions work as they do on Atlas,
 * then connects and bootstraps it. returns a function that tears it all down
 */
export async function startTestDb() {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGODB_VERSION },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri());
  await bootstrapDb();

  return async function stopTestDb() {
    await mongoose.disconnect();
    await replSet.stop();
  };
}

/** MongoDB's code for a document that fails the collection validator */
export const DOCUMENT_VALIDATION_FAILURE = 121;
export const DUPLICATE_KEY = 11000;

import mongoose from 'mongoose';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { bootstrapDb } from '../../src/db/index.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopTestDb = await startTestDb();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await stopTestDb?.();
});

async function snapshot() {
  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();
  const result: Record<string, unknown> = {};
  for (const c of collections) {
    result[c.name] = {
      options: 'options' in c ? c.options : undefined,
      indexes: await db.collection(c.name).indexes(),
    };
  }
  return result;
}

test('a second bootstrap run changes nothing', async () => {
  const before = await snapshot();

  const second = await bootstrapDb();

  expect(second).toEqual({
    createdCollections: [],
    updatedValidators: [],
    createdIndexes: [],
    droppedIndexes: [],
  });
  expect(await snapshot()).toEqual(before);
});

test('every collection has a validator', async () => {
  const collections = await mongoose.connection.db!.listCollections().toArray();
  expect(collections).toHaveLength(10);
  for (const c of collections) {
    expect('options' in c && c.options?.validator).toBeTruthy();
  }
});

test('bootstrap leaves indexes on collections it does not manage', async () => {
  const sessions = mongoose.connection.db!.collection('sessions');
  await sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });

  await bootstrapDb();

  const names = (await sessions.indexes()).map((index) => index.name);
  expect(names).toContain('expires_1');
});

import mongoose from 'mongoose';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { NotificationModel, bootstrapDb } from '../../src/db/index.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopTestDb = await startTestDb();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await stopTestDb?.();
});

interface Validator {
  $jsonSchema: { properties: { kind: { enum: string[] } } };
}

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
  expect(collections).toHaveLength(13);
  for (const c of collections) {
    expect('options' in c && c.options?.validator).toBeTruthy();
  }
});

test('bootstrap creates the message id index, for rows that have an id only', async () => {
  const notifications = mongoose.connection.db!.collection('notifications');
  await notifications.dropIndex('providerMessageId_1');

  const result = await bootstrapDb();

  expect(result.createdIndexes).toEqual(['notifications.providerMessageId_1']);
  const index = (await notifications.indexes()).find((i) => i.name === 'providerMessageId_1');
  expect(index).toMatchObject({
    key: { providerMessageId: 1 },
    partialFilterExpression: { providerMessageId: { $gt: '' } },
  });
  expect(index).not.toHaveProperty('sparse');
  expect((await bootstrapDb()).createdIndexes).toEqual([]);
});

test('a delivery report finds its row through the message id index', async () => {
  const plan = await NotificationModel.find({
    providerMessageId: `SM${'0'.repeat(32)}`,
    deliveryStatus: { $in: ['queued', 'sent'] },
  }).explain('queryPlanner');

  const winning = JSON.stringify(
    (plan as unknown as { queryPlanner: { winningPlan: unknown } }).queryPlanner.winningPlan,
  );
  expect(winning).toContain('IXSCAN');
  expect(winning).toContain('providerMessageId_1');
});

test('an in-app row with no message id stays out of that index', async () => {
  const row = {
    kind: 'offer_posted',
    title: 'New offer K4F2',
    body: '31 kg in Woodstock.',
  } as const;
  await NotificationModel.create([
    { ...row, channel: 'in_app', deliveryStatus: 'delivered' },
    { ...row, channel: 'sms', to: '+27820000001', providerMessageId: `SM${'1'.repeat(32)}` },
  ]);

  const indexed = await NotificationModel.find({}).hint('providerMessageId_1');

  expect(indexed.map((n) => n.channel)).toEqual(['sms']);
  await NotificationModel.deleteMany({});
});

test('bootstrap updates a validator that is out of date', async () => {
  const db = mongoose.connection.db!;
  const [info] = await db.listCollections({ name: 'notifications' }).toArray();
  const current = (info as unknown as { options: { validator: Validator } }).options.validator;
  const outdated = structuredClone(current);
  outdated.$jsonSchema.properties.kind.enum = outdated.$jsonSchema.properties.kind.enum.filter(
    (kind) => kind !== 'certificate_issued',
  );
  const row = {
    kind: 'certificate_issued',
    channel: 'in_app',
    deliveryStatus: 'delivered',
    title: 'Tax certificate FEDSA-2026-0001',
    body: 'Your tax certificate is ready.',
  } as const;

  await db.command({ collMod: 'notifications', validator: outdated });
  try {
    await expect(NotificationModel.create(row)).rejects.toThrow();

    const result = await bootstrapDb();

    expect(result.updatedValidators).toEqual(['notifications']);
    await NotificationModel.create(row);
    await NotificationModel.deleteMany({});
  } finally {
    await bootstrapDb();
  }
});

test('bootstrap leaves indexes on collections it does not manage', async () => {
  const sessions = mongoose.connection.db!.collection('sessions');
  await sessions.createIndex({ expires: 1 }, { expireAfterSeconds: 0 });

  await bootstrapDb();

  const names = (await sessions.indexes()).map((index) => index.name);
  expect(names).toContain('expires_1');
});

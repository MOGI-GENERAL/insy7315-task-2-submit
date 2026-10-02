import type { AuditAction } from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { AuditLogModel, AuditLogRepository } from '../../src/db/index.js';
import { AuditService } from '../../src/services/audit-service.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopTestDb = await startTestDb();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await stopTestDb?.();
});

const audit = new AuditService(new AuditLogRepository());

test('record writes one audit entry', async () => {
  const userId = new Types.ObjectId();
  const organisationId = new Types.ObjectId();

  await audit.record(
    userId,
    'verify_organisation',
    { type: 'organisations', id: organisationId },
    { note: 'Registration documents checked' },
  );

  const entries = await AuditLogModel.find({ userId }).lean();
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    action: 'verify_organisation',
    targetType: 'organisations',
    targetId: organisationId,
    note: 'Registration documents checked',
  });
  expect(entries[0]!.at).toBeInstanceOf(Date);
});

test('record rejects an action outside the contract', async () => {
  const userId = new Types.ObjectId();

  await expect(
    audit.record(userId, 'delete_everything' as AuditAction, {
      type: 'users',
      id: new Types.ObjectId(),
    }),
  ).rejects.toThrow();

  expect(await AuditLogModel.countDocuments({ userId })).toBe(0);
});

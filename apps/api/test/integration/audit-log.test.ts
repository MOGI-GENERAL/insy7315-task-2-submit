import { AuditLogResponse, ErrorEnvelope, type AuditAction } from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AuditLogModel } from '../../src/db/index.js';
import type { TestClient } from '../test-client.js';
import { createUser, signedInClient, startTestApp } from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let admin: TestClient;

/** each one either side of midnight in South Africa, which is two hours ahead of UTC */
const FIXTURES: [string, AuditAction, string][] = [
  ['a', 'verify_organisation', '2025-03-09T21:59:00Z'],
  ['b', 'create_user', '2025-03-09T22:00:00Z'],
  ['c', 'disable_user', '2025-03-10T21:59:59Z'],
  ['d', 'create_user', '2025-03-10T22:00:00Z'],
  ['e', 'issue_certificate', '2025-03-12T08:00:00Z'],
];
const ids = new Map<string, string>();

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  closeApp = app.close;
  const user = await createUser({ role: 'administrator' });
  admin = await signedInClient(app.baseUrl, user.email);

  for (const [key, action, at] of FIXTURES) {
    const entry = await AuditLogModel.create({
      userId: user._id,
      action,
      targetType: 'users',
      targetId: new Types.ObjectId(),
      note: key === 'c' ? 'Left at the end of the month' : null,
      at: new Date(at),
    });
    ids.set(key, entry.id);
  }
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

/** the fixture keys the query returns, in the order it returns them */
async function keysFor(query: string) {
  const res = await admin.get(`/api/audit-log${query}`);
  expect(res.status, query).toBe(200);
  const body = AuditLogResponse.parse(await res.json());
  const keyOf = new Map([...ids].map(([key, id]) => [id, key]));
  return body.items.map((entry) => keyOf.get(entry.id));
}

describe('audit log', () => {
  test('with no filter, every entry comes back newest first', async () => {
    expect(await keysFor('')).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  test('entries carry the actor, target and note', async () => {
    const body = AuditLogResponse.parse(await (await admin.get('/api/audit-log')).json());
    const c = body.items.find((entry) => entry.id === ids.get('c'));
    expect(c).toMatchObject({
      action: 'disable_user',
      targetType: 'users',
      note: 'Left at the end of the month',
      at: '2025-03-10T21:59:59.000Z',
    });
  });

  test('from and to are South African days and include both ends', async () => {
    expect(await keysFor('?from=2025-03-10&to=2025-03-10')).toEqual(['c', 'b']);
    expect(await keysFor('?from=2025-03-11')).toEqual(['e', 'd']);
    expect(await keysFor('?to=2025-03-09')).toEqual(['a']);
    expect(await keysFor('?from=2025-03-11&to=2025-03-10')).toEqual([]);
  });

  test('action filters on its own and with a range', async () => {
    expect(await keysFor('?action=create_user')).toEqual(['d', 'b']);
    expect(await keysFor('?action=create_user&from=2025-03-10&to=2025-03-10')).toEqual(['b']);
    expect(await keysFor('?action=resolve_dispute')).toEqual([]);
  });

  test('an unknown action or a malformed day is refused', async () => {
    for (const query of ['?action=delete_everything', '?from=2025-3-1', '?to=yesterday']) {
      const res = await admin.get(`/api/audit-log${query}`);
      expect(res.status, query).toBe(400);
      expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('VALIDATION_FAILED');
    }
  });
});

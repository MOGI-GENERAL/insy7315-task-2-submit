import { ErrorEnvelope } from '@fedsa/contract';
import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { UserModel } from '../../src/db/index.js';
import { requireAuth, requireOwnership, requireRole } from '../../src/middleware/guards.js';
import { TestClient } from '../test-client.js';
import { createUser, signedInClient, startTestApp } from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

/** record ID to owning organisation ID, standing in for a real collection */
const owners = new Map<string, string>();

function ok(_req: Request, res: Response) {
  res.json({ ok: true });
}

const throwaway = Router();
throwaway.get('/test/signed-in', requireAuth, ok);
throwaway.get('/test/coordinators', requireRole('coordinator'), ok);
throwaway.get(
  '/test/records/:id',
  requireRole('donor', 'coordinator'),
  requireOwnership(async (req) => owners.get(String(req.params.id)) ?? null),
  ok,
);

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp([throwaway]);
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

async function errorCode(res: globalThis.Response) {
  return ErrorEnvelope.parse(await res.json()).error.code;
}

describe('requireAuth', () => {
  test('refuses an anonymous caller and lets a signed-in user through', async () => {
    const user = await createUser({ role: 'administrator' });
    const signedIn = await signedInClient(baseUrl, user.email);

    const refused = await new TestClient(baseUrl).get('/test/signed-in');

    expect(refused.status).toBe(401);
    expect(await errorCode(refused)).toBe('UNAUTHENTICATED');
    expect((await signedIn.get('/test/signed-in')).status).toBe(200);
  });
});

describe('requireRole', () => {
  test('refuses a user without one of the roles', async () => {
    const donor = await createUser({ role: 'donor', organisationId: new Types.ObjectId() });
    const coordinator = await createUser({ role: 'coordinator' });

    const anonymous = await new TestClient(baseUrl).get('/test/coordinators');
    const refused = await (await signedInClient(baseUrl, donor.email)).get('/test/coordinators');
    const allowed = await (
      await signedInClient(baseUrl, coordinator.email)
    ).get('/test/coordinators');

    expect(anonymous.status).toBe(401);
    expect(refused.status).toBe(403);
    expect(await errorCode(refused)).toBe('FORBIDDEN');
    expect(allowed.status).toBe(200);
  });

  test('a role change applies to an open session on its next request', async () => {
    const user = await createUser({ role: 'donor', organisationId: new Types.ObjectId() });
    const client = await signedInClient(baseUrl, user.email);
    expect((await client.get('/test/coordinators')).status).toBe(403);

    await UserModel.updateOne({ _id: user._id }, { $set: { role: 'coordinator' } });

    expect((await client.get('/test/coordinators')).status).toBe(200);
  });
});

describe('requireOwnership', () => {
  test("another organisation's record looks the same as a missing one", async () => {
    const ownOrganisation = new Types.ObjectId();
    const recordId = new Types.ObjectId().toString();
    owners.set(recordId, ownOrganisation.toString());
    const owner = await createUser({ role: 'donor', organisationId: ownOrganisation });
    const outsider = await createUser({ role: 'donor', organisationId: new Types.ObjectId() });
    const outsiderClient = await signedInClient(baseUrl, outsider.email);

    const allowed = await (
      await signedInClient(baseUrl, owner.email)
    ).get(`/test/records/${recordId}`);
    const hidden = await outsiderClient.get(`/test/records/${recordId}`);
    const missing = await outsiderClient.get(`/test/records/${new Types.ObjectId()}`);

    expect(allowed.status).toBe(200);
    expect(hidden.status).toBe(404);
    const hiddenBody = await hidden.text();
    expect(ErrorEnvelope.parse(JSON.parse(hiddenBody)).error.code).toBe('NOT_FOUND');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe(hiddenBody);
  });

  test('FEDSA staff have no organisation and are left to the role guard', async () => {
    const recordId = new Types.ObjectId().toString();
    owners.set(recordId, new Types.ObjectId().toString());
    const coordinator = await createUser({ role: 'coordinator' });

    const res = await (
      await signedInClient(baseUrl, coordinator.email)
    ).get(`/test/records/${recordId}`);

    expect(res.status).toBe(200);
  });
});

import {
  CreateUserResponse,
  ErrorEnvelope,
  SessionResponse,
  UserListResponse,
  UserResponse,
  type CreateUserRequest,
} from '@fedsa/contract';
import bcrypt from 'bcryptjs';
import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AuditLogModel, SESSIONS_COLLECTION, UserModel } from '../../src/db/index.js';
import type { TestClient } from '../test-client.js';
import {
  anonymousClient,
  createOrganisation,
  createUser,
  signedInClient,
  startTestApp,
  uniqueEmail,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let admin: Awaited<ReturnType<typeof createUser>>;
let adminClient: TestClient;

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  closeApp = app.close;
  baseUrl = app.baseUrl;
  admin = await createUser({ role: 'administrator' });
  adminClient = await signedInClient(baseUrl, admin.email);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

async function errorOf(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error;
}

function newAccount(fields: Partial<CreateUserRequest> = {}): CreateUserRequest {
  return {
    fullName: 'Lerato Mokoena',
    email: uniqueEmail('account'),
    role: 'coordinator',
    phone: '+27829990001',
    languagePreference: 'en',
    ...fields,
  };
}

function patch(client: TestClient, userId: unknown, body: unknown) {
  return client.request('PATCH', `/api/users/${String(userId)}`, body);
}

function sessionCount(userId: Types.ObjectId) {
  return mongoose.connection
    .collection(SESSIONS_COLLECTION)
    .countDocuments({ 'session.userId': userId.toString() });
}

function auditRows(targetId: Types.ObjectId | string) {
  return AuditLogModel.find({ targetId }).sort({ _id: 1 }).lean();
}

describe('create', () => {
  test('a coordinator account has no organisation and a temporary password', async () => {
    const res = await adminClient.post('/api/users', newAccount());

    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain('$2b$');
    expect(text).not.toContain('passwordHash');
    const body = CreateUserResponse.parse(JSON.parse(text));
    expect(body.user).toMatchObject({
      role: 'coordinator',
      organisationId: null,
      status: 'active',
      mustChangePassword: true,
      lastLoginAt: null,
    });
    expect(body.tempPassword.length).toBeGreaterThanOrEqual(10);

    const stored = await UserModel.findById(body.user.id).lean();
    expect(stored!.passwordHash).not.toBe(body.tempPassword);
    expect(stored!.passwordHash).toMatch(/^\$2b\$12\$/);
    expect(await bcrypt.compare(body.tempPassword, stored!.passwordHash)).toBe(true);
    expect(stored!.consentedAt).toBeNull();
  });

  test('a donor or recipient account belongs to an organisation of its own type', async () => {
    const donorOrg = await createOrganisation({ type: 'donor' });
    const recipientOrg = await createOrganisation({ type: 'recipient' });

    const donor = await adminClient.post(
      '/api/users',
      newAccount({ role: 'donor', organisationId: donorOrg.id }),
    );
    const recipient = await adminClient.post(
      '/api/users',
      newAccount({ role: 'recipient', organisationId: recipientOrg.id }),
    );

    expect(donor.status).toBe(201);
    expect(CreateUserResponse.parse(await donor.json()).user.organisationId).toBe(donorOrg.id);
    expect(recipient.status).toBe(201);
    expect(CreateUserResponse.parse(await recipient.json()).user.organisationId).toBe(
      recipientOrg.id,
    );
  });

  test('organisation rules, an unknown organisation and a taken email are refused', async () => {
    const donorOrg = await createOrganisation({ type: 'donor' });
    const refused = [
      newAccount({ role: 'donor' }),
      newAccount({ role: 'coordinator', organisationId: donorOrg.id }),
      newAccount({ role: 'recipient', organisationId: donorOrg.id }),
      newAccount({ role: 'donor', organisationId: new Types.ObjectId().toHexString() }),
    ];

    for (const body of refused) {
      const res = await adminClient.post('/api/users', body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await errorOf(res)).fields).toHaveProperty('organisationId');
    }

    const taken = await adminClient.post('/api/users', newAccount({ email: admin.email }));
    expect(taken.status).toBe(400);
    expect((await errorOf(taken)).fields).toHaveProperty('email');
    expect(await UserModel.countDocuments({ email: admin.email })).toBe(1);
  });

  test('the temporary password signs in once and must be replaced before anything else', async () => {
    const res = await adminClient.post('/api/users', newAccount());
    const { user, tempPassword } = CreateUserResponse.parse(await res.json());

    const client = await signedInClient(baseUrl, user.email, tempPassword);
    const me = SessionResponse.parse(await (await client.get('/api/me')).json());
    expect(me.user.mustChangePassword).toBe(true);
    const blocked = await client.get('/api/organisations');
    expect(blocked.status).toBe(403);
    expect((await errorOf(blocked)).code).toBe('FORBIDDEN');

    const changed = await client.post('/api/me/password', {
      currentPassword: tempPassword,
      newPassword: 'my own long password',
    });
    expect(changed.status).toBe(204);
    expect((await client.get('/api/organisations')).status).toBe(200);
    await expect(signedInClient(baseUrl, user.email, tempPassword)).rejects.toThrow();
    await expect(signedInClient(baseUrl, user.email, 'my own long password')).resolves.toBeTruthy();
  });
});

describe('list', () => {
  test('filters by role, status and a search on name or email, with no hashes', async () => {
    const tag = `zz${Date.now()}`;
    await adminClient.post('/api/users', newAccount({ fullName: `Pat ${tag}` }));
    const disabled = await createUser({ role: 'coordinator', status: 'disabled' });

    const byName = UserListResponse.parse(
      await (await adminClient.get(`/api/users?q=${tag.toUpperCase()}`)).json(),
    );
    expect(byName.items.map((u) => u.fullName)).toEqual([`Pat ${tag}`]);

    const byEmail = UserListResponse.parse(
      await (await adminClient.get(`/api/users?q=${encodeURIComponent(disabled.email)}`)).json(),
    );
    expect(byEmail.items.map((u) => u.id)).toEqual([disabled.id]);

    const res = await adminClient.get('/api/users?role=coordinator&status=disabled');
    const text = await res.text();
    expect(text).not.toContain('$2b$');
    expect(text).not.toContain('passwordHash');
    const filtered = UserListResponse.parse(JSON.parse(text));
    expect(filtered.items.map((u) => u.id)).toContain(disabled.id);
    expect(filtered.items.every((u) => u.role === 'coordinator' && u.status === 'disabled')).toBe(
      true,
    );
  });

  test('a search is matched literally, not as a pattern', async () => {
    const res = await adminClient.get('/api/users?q=.*');
    expect(UserListResponse.parse(await res.json()).items).toEqual([]);
  });
});

describe('role and status changes', () => {
  test("a role change ends the user's sessions in every browser and is audited", async () => {
    const user = await createUser({ role: 'coordinator' });
    const first = await signedInClient(baseUrl, user.email);
    const second = await signedInClient(baseUrl, user.email);
    expect(await sessionCount(user._id)).toBe(2);

    const res = await patch(adminClient, user.id, { role: 'administrator' });

    expect(res.status).toBe(200);
    expect(UserResponse.parse(await res.json()).user.role).toBe('administrator');
    expect((await first.get('/api/me')).status).toBe(401);
    expect((await second.get('/api/me')).status).toBe(401);
    expect(await sessionCount(user._id)).toBe(0);

    const rows = await auditRows(user._id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: admin._id,
      action: 'change_role',
      targetType: 'users',
      note: 'coordinator to administrator',
    });
  });

  test("disabling ends the user's sessions in every browser and stops sign-in", async () => {
    const user = await createUser({ role: 'coordinator' });
    const first = await signedInClient(baseUrl, user.email);
    const second = await signedInClient(baseUrl, user.email);

    const res = await patch(adminClient, user.id, { status: 'disabled' });

    expect(res.status).toBe(200);
    expect(UserResponse.parse(await res.json()).user.status).toBe('disabled');
    expect((await first.get('/api/me')).status).toBe(401);
    expect((await second.get('/api/me')).status).toBe(401);
    expect(await sessionCount(user._id)).toBe(0);
    await expect(signedInClient(baseUrl, user.email)).rejects.toThrow();

    const rows = await auditRows(user._id);
    expect(rows.map((r) => r.action)).toEqual(['disable_user']);
  });

  test('re-enabling lets a disabled user sign in again and is audited', async () => {
    const user = await createUser({ role: 'coordinator', status: 'disabled' });

    const res = await patch(adminClient, user.id, { status: 'active' });

    expect(res.status).toBe(200);
    expect(UserResponse.parse(await res.json()).user.status).toBe('active');
    await expect(signedInClient(baseUrl, user.email)).resolves.toBeTruthy();
    expect((await auditRows(user._id)).map((r) => r.action)).toEqual(['enable_user']);
  });

  test('a role and status change together write one row for each', async () => {
    const user = await createUser({ role: 'administrator', status: 'disabled' });

    const res = await patch(adminClient, user.id, { role: 'coordinator', status: 'active' });

    expect(res.status).toBe(200);
    expect((await auditRows(user._id)).map((r) => r.action)).toEqual([
      'change_role',
      'enable_user',
    ]);
  });

  test('a request that changes nothing leaves sessions and the audit log alone', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);

    const res = await patch(adminClient, user.id, { role: 'coordinator', status: 'active' });

    expect(res.status).toBe(200);
    expect((await client.get('/api/me')).status).toBe(200);
    expect(await auditRows(user._id)).toEqual([]);
  });

  test('an organisation account keeps its role', async () => {
    const organisation = await createOrganisation({ type: 'donor' });
    const user = await createUser({ role: 'donor', organisationId: organisation._id });

    const res = await patch(adminClient, user.id, { role: 'coordinator' });

    expect(res.status).toBe(400);
    expect((await errorOf(res)).fields).toHaveProperty('role');
    expect((await UserModel.findById(user._id).lean())!.role).toBe('donor');
  });

  test('an unknown user is not found and an empty change is refused', async () => {
    const missing = await patch(adminClient, new Types.ObjectId(), { status: 'disabled' });
    expect(missing.status).toBe(404);

    const user = await createUser({ role: 'coordinator' });
    expect((await patch(adminClient, user.id, {})).status).toBe(400);
  });
});

describe('self-protection', () => {
  test('an administrator cannot disable themselves or give up the role', async () => {
    const self = await createUser({ role: 'administrator' });
    const client = await signedInClient(baseUrl, self.email);

    for (const body of [{ status: 'disabled' }, { role: 'coordinator' }]) {
      const res = await patch(client, self.id, body);
      expect(res.status, JSON.stringify(body)).toBe(409);
      expect((await errorOf(res)).code).toBe('INVALID_STATE');
    }

    const stored = await UserModel.findById(self._id).lean();
    expect(stored).toMatchObject({ role: 'administrator', status: 'active' });
    expect((await client.get('/api/me')).status).toBe(200);
    expect(await auditRows(self._id)).toEqual([]);
  });
});

describe('access', () => {
  test('every route refuses everyone but an administrator', async () => {
    const donorOrg = await createOrganisation({ type: 'donor' });
    const recipientOrg = await createOrganisation({ type: 'recipient' });
    const target = await createUser({ role: 'coordinator' });
    const callers = [
      await createUser({ role: 'donor', organisationId: donorOrg._id }),
      await createUser({ role: 'recipient', organisationId: recipientOrg._id }),
      await createUser({ role: 'coordinator' }),
    ];
    const routes: [string, string, unknown?][] = [
      ['GET', '/api/users'],
      ['POST', '/api/users', newAccount()],
      ['PATCH', `/api/users/${target.id}`, { status: 'disabled' }],
      ['GET', '/api/audit-log'],
    ];

    for (const caller of callers) {
      const client = await signedInClient(baseUrl, caller.email);
      for (const [method, path, body] of routes) {
        const res = await client.request(method, path, body);
        expect(res.status, `${caller.role} ${method} ${path}`).toBe(403);
      }
    }

    const anonymous = await anonymousClient(baseUrl);
    for (const [method, path, body] of routes) {
      expect((await anonymous.request(method, path, body)).status, `${method} ${path}`).toBe(401);
    }

    expect((await UserModel.findById(target._id).lean())!.status).toBe('active');
    expect(await AuditLogModel.countDocuments({ targetId: target._id })).toBe(0);
  });
});

describe('audit', () => {
  test('creating an account writes a create_user row naming the new account', async () => {
    const res = await adminClient.post('/api/users', newAccount());
    const { user } = CreateUserResponse.parse(await res.json());

    const rows = await auditRows(new Types.ObjectId(user.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: admin._id,
      action: 'create_user',
      targetType: 'users',
      note: null,
    });
  });
});

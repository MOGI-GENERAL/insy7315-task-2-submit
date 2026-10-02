import { ErrorEnvelope, SessionResponse, suburbLocation } from '@fedsa/contract';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { OrganisationModel, SESSIONS_COLLECTION, UserModel } from '../../src/db/index.js';
import { CONSENT_VERSION } from '../../src/services/user-service.js';
import { TestClient } from '../test-client.js';
import {
  TEST_PASSWORD,
  anonymousClient,
  createUser,
  donorRegistration,
  recipientRegistration,
  signedInClient,
  startTestApp,
  uniqueEmail,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

async function errorCode(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error.code;
}

describe('register', () => {
  test('a donor organisation and its first user are created, active and signed in', async () => {
    const client = await anonymousClient(baseUrl);
    const input = donorRegistration();

    const res = await client.post('/api/auth/register', input);

    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain(TEST_PASSWORD);
    expect(text).not.toContain('$2b$');
    const body = SessionResponse.parse(JSON.parse(text));
    expect(body.organisation).toMatchObject({
      type: 'donor',
      status: 'active',
      suburb: 'Woodstock',
      city: 'Cape Town',
      location: suburbLocation('Woodstock'),
    });
    expect(body.user).toMatchObject({
      role: 'donor',
      email: input.user.email,
      organisationId: body.organisation!.id,
      mustChangePassword: false,
    });

    const stored = await UserModel.findById(body.user.id).lean();
    expect(stored!.consentedAt).toBeInstanceOf(Date);
    expect(stored!.consentVersion).toBe(CONSENT_VERSION);
    expect(stored!.passwordHash).toMatch(/^\$2b\$12\$/);

    await client.fetchCsrfToken();
    expect((await client.get('/api/me')).status).toBe(200);
  });

  test('a recipient organisation starts pending verification', async () => {
    const client = await anonymousClient(baseUrl);

    const res = await client.post('/api/auth/register', recipientRegistration());

    expect(res.status).toBe(201);
    const body = SessionResponse.parse(await res.json());
    expect(body.organisation).toMatchObject({
      type: 'recipient',
      status: 'pending',
      location: suburbLocation('Khayelitsha'),
      storageAmbient: true,
      maxCapacityKg: null,
      hasTransport: false,
    });
  });

  test('the same password is hashed with a different salt for each user', async () => {
    const first = await anonymousClient(baseUrl);
    const second = await anonymousClient(baseUrl);
    const a = SessionResponse.parse(
      await (await first.post('/api/auth/register', donorRegistration())).json(),
    );
    const b = SessionResponse.parse(
      await (await second.post('/api/auth/register', donorRegistration())).json(),
    );

    const [hashA, hashB] = await Promise.all([
      UserModel.findById(a.user.id).lean(),
      UserModel.findById(b.user.id).lean(),
    ]);
    expect(hashA!.passwordHash).not.toBe(hashB!.passwordHash);
  });

  test('a registration without consent is refused', async () => {
    const client = await anonymousClient(baseUrl);
    const withoutConsent = { ...donorRegistration(), consent: undefined };
    const declined = { ...donorRegistration(), consent: false };

    for (const input of [withoutConsent, declined]) {
      const res = await client.post('/api/auth/register', input);

      expect(res.status).toBe(400);
      const body = ErrorEnvelope.parse(await res.json());
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.fields).toHaveProperty('consent');
      expect(await UserModel.countDocuments({ email: input.user.email })).toBe(0);
    }
  });

  test('registration creates the organisation and the user together or neither', async () => {
    const email = uniqueEmail('taken');
    const first = await anonymousClient(baseUrl);
    expect((await first.post('/api/auth/register', donorRegistration(email))).status).toBe(201);

    const second = await anonymousClient(baseUrl);
    const input = donorRegistration(email);
    input.organisation.name = `Kaap Foods ${email}`;
    const res = await second.post('/api/auth/register', input);

    expect(res.status).toBe(400);
    const body = ErrorEnvelope.parse(await res.json());
    expect(body.error.fields).toHaveProperty(['user.email']);
    expect(await OrganisationModel.countDocuments({ name: input.organisation.name })).toBe(0);
  });
});

describe('login', () => {
  test('a successful login starts a new session and reports a forced password change', async () => {
    const user = await createUser({ role: 'coordinator', mustChangePassword: true });
    const client = await anonymousClient(baseUrl);
    const anonymousCookie = client.cookie;

    const res = await client.post('/api/auth/login', {
      email: user.email,
      password: TEST_PASSWORD,
    });

    expect(res.status).toBe(200);
    const body = SessionResponse.parse(await res.json());
    expect(body.user.id).toBe(user.id);
    expect(body.user.mustChangePassword).toBe(true);
    expect(body.user.lastLoginAt).not.toBeNull();
    expect(body.organisation).toBeNull();
    expect(client.cookie).not.toBe('');
    expect(client.cookie).not.toBe(anonymousCookie);

    const cookie = res.headers.getSetCookie()[0]!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const expires = Date.parse(/Expires=([^;]+)/.exec(cookie)![1]!);
    expect(Math.abs(expires - (Date.now() + 12 * 60 * 60 * 1000))).toBeLessThan(60_000);

    const stored = await UserModel.findById(user._id).lean();
    expect(stored!.lastLoginAt).toBeInstanceOf(Date);
  });

  test('the session stores the user ID where it can be queried', async () => {
    const user = await createUser({ role: 'administrator' });

    await signedInClient(baseUrl, user.email);

    const sessions = mongoose.connection.db!.collection(SESSIONS_COLLECTION);
    expect(await sessions.countDocuments({ 'session.userId': user.id })).toBe(1);
  });

  test('an unknown email, a wrong password and a disabled account get identical responses', async () => {
    const active = await createUser({ role: 'coordinator' });
    const disabled = await createUser({ role: 'coordinator', status: 'disabled' });
    const attempts = [
      { email: uniqueEmail('nobody'), password: TEST_PASSWORD },
      { email: active.email, password: 'not the password' },
      { email: disabled.email, password: TEST_PASSWORD },
    ];

    const responses = [];
    for (const attempt of attempts) {
      const client = await anonymousClient(baseUrl);
      const res = await client.post('/api/auth/login', attempt);
      responses.push({ status: res.status, body: await res.text() });
    }

    expect(responses[0]!.status).toBe(401);
    expect(ErrorEnvelope.parse(JSON.parse(responses[0]!.body)).error.code).toBe('UNAUTHENTICATED');
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
  });
});

describe('sessions', () => {
  test('me returns the signed-in user and refuses an anonymous caller', async () => {
    const user = await createUser({ role: 'coordinator' });
    const anonymous = new TestClient(baseUrl);
    const signedIn = await signedInClient(baseUrl, user.email);

    const refused = await anonymous.get('/api/me');
    const allowed = await signedIn.get('/api/me');

    expect(refused.status).toBe(401);
    expect(await errorCode(refused)).toBe('UNAUTHENTICATED');
    expect(allowed.status).toBe(200);
    expect(SessionResponse.parse(await allowed.json()).user.id).toBe(user.id);
  });

  test('logout ends the session, even for a copy of the old cookie', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);
    const oldCookie = client.cookie;

    const res = await client.post('/api/auth/logout');

    expect(res.status).toBe(204);
    expect(client.cookie).toBe('');
    client.cookie = oldCookie;
    expect((await client.get('/api/me')).status).toBe(401);
  });

  test("a disabled user's open session is refused on its next request", async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);
    expect((await client.get('/api/me')).status).toBe(200);

    await UserModel.updateOne({ _id: user._id }, { $set: { status: 'disabled' } });

    const res = await client.get('/api/me');
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe('UNAUTHENTICATED');
  });

  test('a session survives an API restart', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);
    const restarted = await startTestApp();

    try {
      const res = await fetch(`${restarted.baseUrl}/api/me`, {
        headers: { cookie: client.cookie },
      });
      expect(res.status).toBe(200);
    } finally {
      await restarted.close();
    }
  });

  test('the database removes expired sessions itself', async () => {
    const indexes = await mongoose.connection.db!.collection(SESSIONS_COLLECTION).indexes();

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { expires: 1 }, expireAfterSeconds: 0 }),
    );
  });
});

describe('CSRF', () => {
  test('a state-changing request without a token is refused', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);
    client.csrfToken = '';

    const res = await client.post('/api/auth/logout');

    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('CSRF_INVALID');
    expect((await client.get('/api/me')).status).toBe(200);
  });

  test('a state-changing request with the wrong token is refused', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);
    client.csrfToken = client.csrfToken.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));

    const res = await client.post('/api/auth/logout');

    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('CSRF_INVALID');
  });

  test('a token issued before signing in stops working after it', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await anonymousClient(baseUrl);
    await client.post('/api/auth/login', { email: user.email, password: TEST_PASSWORD });

    const res = await client.post('/api/auth/logout');

    expect(res.status).toBe(403);
    expect(await errorCode(res)).toBe('CSRF_INVALID');
  });
});

describe('change password', () => {
  test('a wrong current password is refused', async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await signedInClient(baseUrl, user.email);

    const res = await client.post('/api/me/password', {
      currentPassword: 'not the password',
      newPassword: 'a brand new password',
    });

    expect(res.status).toBe(400);
    expect(ErrorEnvelope.parse(await res.json()).error.fields).toHaveProperty('currentPassword');
  });

  test('the new password replaces the old one and other sessions end', async () => {
    const user = await createUser({ role: 'coordinator', mustChangePassword: true });
    const current = await signedInClient(baseUrl, user.email);
    const other = await signedInClient(baseUrl, user.email);

    const res = await current.post('/api/me/password', {
      currentPassword: TEST_PASSWORD,
      newPassword: 'a brand new password',
    });

    expect(res.status).toBe(204);
    const me = SessionResponse.parse(await (await current.get('/api/me')).json());
    expect(me.user.mustChangePassword).toBe(false);
    expect((await other.get('/api/me')).status).toBe(401);
    await expect(signedInClient(baseUrl, user.email)).rejects.toThrow();
    await expect(signedInClient(baseUrl, user.email, 'a brand new password')).resolves.toBeTruthy();
  });
});

describe('rate limits', () => {
  test('successful logins from one address are never limited', { timeout: 30_000 }, async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await anonymousClient(baseUrl);

    for (let i = 0; i < 6; i += 1) {
      const res = await client.post('/api/auth/login', {
        email: user.email,
        password: TEST_PASSWORD,
      });
      expect(res.status).toBe(200);
      await client.fetchCsrfToken();
    }
  });

  test('login allows five failed attempts per address and email', { timeout: 30_000 }, async () => {
    const user = await createUser({ role: 'coordinator' });
    const client = await anonymousClient(baseUrl);
    const attempt = (email: string) =>
      client.post('/api/auth/login', { email, password: 'not the password' });

    for (let i = 0; i < 5; i += 1) expect((await attempt(user.email)).status).toBe(401);
    const limited = await attempt(user.email);

    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('RATE_LIMITED');
    expect((await attempt(uniqueEmail('other'))).status).toBe(401);

    const elsewhere = await anonymousClient(baseUrl);
    const res = await elsewhere.post('/api/auth/login', {
      email: user.email,
      password: TEST_PASSWORD,
    });
    expect(res.status).toBe(200);
  });
});

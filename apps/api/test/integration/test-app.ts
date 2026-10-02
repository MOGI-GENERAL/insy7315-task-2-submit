import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { RegisterRequest } from '@fedsa/contract';
import bcrypt from 'bcryptjs';
import type { Router } from 'express';
import type { Types } from 'mongoose';
import { createApp } from '../../src/app.js';
import {
  HealthRepository,
  OrganisationRepository,
  SessionRepository,
  UserModel,
  UserRepository,
} from '../../src/db/index.js';
import { createLogger } from '../../src/logger.js';
import { createSessionStore } from '../../src/middleware/session.js';
import { HealthService } from '../../src/services/health-service.js';
import { UserService } from '../../src/services/user-service.js';
import { TestClient } from '../test-client.js';

/** obviously fake. tests sign their own cookies and nothing else */
export const TEST_SESSION_SECRET = 'integration-test-session-secret';

export const TEST_PASSWORD = 'correct horse battery';

/** starts the real app on the test database. needs `startTestDb` to have run */
export async function startTestApp(extraRouters: Router[] = []) {
  const server = createApp({
    logger: createLogger({ write: () => {} }),
    services: {
      health: new HealthService(new HealthRepository(), 'test-sha'),
      users: new UserService(
        new UserRepository(),
        new OrganisationRepository(),
        new SessionRepository(),
      ),
    },
    session: {
      secret: TEST_SESSION_SECRET,
      secureCookie: false,
      store: await createSessionStore(),
    },
    extraRouters,
  }).listen(0);
  await once(server, 'listening');

  return {
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let emailCount = 0;

export function uniqueEmail(label: string) {
  emailCount += 1;
  return `${label}.${Date.now()}.${emailCount}@example.org`;
}

export function donorRegistration(email = uniqueEmail('donor')): RegisterRequest {
  return {
    role: 'donor',
    organisation: {
      name: "Ouma's Bakery",
      addressLine: '12 Long Street',
      suburb: 'Woodstock',
      contactName: 'Riaan de Villiers',
      contactPhone: '+27821234567',
      contactEmail: 'bakery@example.org',
    },
    user: {
      fullName: 'Riaan de Villiers',
      email,
      password: TEST_PASSWORD,
      phone: '+27821234567',
      languagePreference: 'en',
    },
    consent: true,
  };
}

export function recipientRegistration(email = uniqueEmail('recipient')): RegisterRequest {
  return {
    role: 'recipient',
    organisation: {
      name: 'Siyakhula Shelter',
      addressLine: '4 Lansdowne Road',
      suburb: 'Khayelitsha',
      contactName: 'Nosipho Dlamini',
      contactPhone: '+27831234567',
      contactEmail: 'shelter@example.org',
      storageAmbient: true,
      storageRefrigerated: false,
      storageFrozen: false,
      hasTransport: false,
    },
    user: {
      fullName: 'Nosipho Dlamini',
      email,
      password: TEST_PASSWORD,
      phone: '+27831234567',
      languagePreference: 'xh',
    },
    consent: true,
  };
}

/** a client that has fetched a CSRF token, ready to register or sign in */
export async function anonymousClient(baseUrl: string) {
  const client = new TestClient(baseUrl);
  await client.fetchCsrfToken();
  return client;
}

/** signing in starts a new session, so the client fetches a fresh token afterwards */
export async function signedInClient(baseUrl: string, email: string, password = TEST_PASSWORD) {
  const client = await anonymousClient(baseUrl);
  const res = await client.post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`sign-in failed with ${res.status}`);
  await client.fetchCsrfToken();
  return client;
}

let testPasswordHash: Promise<string> | undefined;

/** coordinators, administrators and accounts in odd states cannot come from registration */
export async function createUser(fields: {
  role: 'donor' | 'recipient' | 'coordinator' | 'administrator';
  organisationId?: Types.ObjectId | null;
  status?: 'active' | 'disabled';
  mustChangePassword?: boolean;
}) {
  // a low cost keeps the suite fast. registration covers the real cost
  testPasswordHash ??= bcrypt.hash(TEST_PASSWORD, 4);
  return UserModel.create({
    organisationId: fields.organisationId ?? null,
    role: fields.role,
    fullName: 'Test User',
    email: uniqueEmail(fields.role),
    passwordHash: await testPasswordHash,
    phone: '+27820000000',
    languagePreference: 'en',
    status: fields.status ?? 'active',
    mustChangePassword: fields.mustChangePassword ?? false,
  });
}

import type { AddressInfo } from 'node:net';
import {
  ErrorEnvelope,
  HealthResponse,
  idParams,
  ListUsersQuery,
  LoginRequest,
} from '@fedsa/contract';
import { Router } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { TestClient } from '../test/test-client.js';
import { createApp } from './app.js';
import {
  AuditLogRepository,
  ClaimRepository,
  CollectionRepository,
  CounterRepository,
  HandoverRepository,
  LoginThrottleRepository,
  NotificationRepository,
  OfferRepository,
  OrganisationRepository,
  SessionRepository,
  TaxCertificateRepository,
  UserRepository,
  ValuationRateRepository,
} from './db/index.js';
import { OfferUnavailableError } from './errors.js';
import { createLogger } from './logger.js';
import { validate } from './middleware/validate.js';
import { LocalPhotoStore } from './photos/local-photo-store.js';
import { AuditService } from './services/audit-service.js';
import { ClaimService } from './services/claim-service.js';
import { CollectionService } from './services/collection-service.js';
import { DEFAULT_RADIUS_KM } from './services/eligibility.js';
import { HandoverService } from './services/handover-service.js';
import { HealthService } from './services/health-service.js';
import { NotificationService } from './services/notification-service.js';
import { OfferService } from './services/offer-service.js';
import { OpenApiService } from './services/openapi-service.js';
import { OrganisationService } from './services/organisation-service.js';
import { ReportingService } from './services/reporting-service.js';
import { UserService } from './services/user-service.js';
import { WebhookService } from './services/webhook-service.js';

const logLines: string[] = [];
const logger = createLogger({ write: (line: string) => void logLines.push(line) });
const logs = () => logLines.join('');

const fakeHealthRepository = {
  up: true,
  async isDatabaseUp() {
    return this.up;
  },
};

const throwaway = Router();
throwaway.post(
  '/test/users/:id',
  validate({ params: idParams, query: ListUsersQuery, body: LoginRequest }),
  (req, res) => {
    res.json({ params: req.params, query: req.query, body: req.body });
  },
);
throwaway.get('/test/crash', () => {
  throw new Error('connection to db-host-17 refused');
});
throwaway.get('/test/claimed', () => {
  throw new OfferUnavailableError();
});
throwaway.post('/api/webhooks/twilio/test', (_req, res) => {
  res.status(204).end();
});

const notifications = new NotificationService(new NotificationRepository(), new UserRepository(), {
  channels: [],
  mirror: true,
  vapidPublicKey: null,
  logger,
});
const photos = new LocalPhotoStore();
const offers = new OfferService(
  new OfferRepository(),
  new OrganisationRepository(),
  new ClaimRepository(),
  new CollectionRepository(),
  new HandoverRepository(),
  new AuditService(new AuditLogRepository()),
  photos,
  notifications,
  { radiusKm: DEFAULT_RADIUS_KM, logger },
);
const claims = new ClaimService(
  new ClaimRepository(),
  new OfferRepository(),
  new OrganisationRepository(),
  new HandoverRepository(),
  new CollectionRepository(),
  offers,
  notifications,
  notifications,
  logger,
);
const handovers = new HandoverService(
  new HandoverRepository(),
  new ClaimRepository(),
  new OfferRepository(),
  new OrganisationRepository(),
  offers,
  new AuditService(new AuditLogRepository()),
  photos,
  notifications,
  logger,
);

// no request in this file signs in, so the user service never reaches a database
const server = createApp({
  logger,
  services: {
    health: new HealthService(fakeHealthRepository, 'test-sha'),
    openApi: new OpenApiService(),
    users: new UserService(
      new UserRepository(),
      new OrganisationRepository(),
      new SessionRepository(),
      new AuditService(new AuditLogRepository()),
      new LoginThrottleRepository(),
    ),
    organisations: new OrganisationService(
      new OrganisationRepository(),
      new OfferRepository(),
      new ClaimRepository(),
      new HandoverRepository(),
      new AuditService(new AuditLogRepository()),
    ),
    offers,
    claims,
    collections: new CollectionService(
      new CollectionRepository(),
      new ClaimRepository(),
      new OfferRepository(),
      new OrganisationRepository(),
      new AuditService(new AuditLogRepository()),
      notifications,
      logger,
    ),
    handovers,
    notifications,
    reports: new ReportingService(
      new HandoverRepository(),
      new OfferRepository(),
      new OrganisationRepository(),
      new ValuationRateRepository(),
      new TaxCertificateRepository(),
      new CounterRepository(),
      new AuditService(new AuditLogRepository()),
    ),
    webhooks: new WebhookService(
      new UserRepository(),
      new OrganisationRepository(),
      new OfferRepository(),
      new NotificationRepository(),
      claims,
      logger,
    ),
    audit: new AuditService(new AuditLogRepository()),
  },
  session: { secret: 'unit-test-session-secret', secureCookie: false },
  extraRouters: [throwaway],
}).listen(0);
let baseUrl = '';
let client: TestClient;

beforeAll(async () => {
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = new TestClient(baseUrl);
  await client.fetchCsrfToken();
});

beforeEach(() => {
  logLines.length = 0;
  fakeHealthRepository.up = true;
});

afterAll(() => {
  server.close();
});

const VALID_ID = '64b7f0c2a1b2c3d4e5f60718';

function post(path: string, body: unknown) {
  return client.post(path, body);
}

describe('health', () => {
  test('reports the version and a reachable database', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.status).toBe(200);
    const body = HealthResponse.parse(await res.json());
    expect(body).toEqual({ ok: true, version: 'test-sha', db: 'up' });
  });

  test('reports an unreachable database as down', async () => {
    fakeHealthRepository.up = false;

    const res = await fetch(`${baseUrl}/api/health`);

    expect(await res.json()).toEqual({ ok: true, version: 'test-sha', db: 'down' });
  });
});

describe('validation', () => {
  test('a failure lists each failing field', async () => {
    const res = await post('/test/users/not-an-id?role=chef', { email: 'a@example.org' });

    expect(res.status).toBe(400);
    const body = ErrorEnvelope.parse(await res.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(body.error.fields ?? {}).sort()).toEqual(['id', 'password', 'role']);
  });

  test('unknown keys are stripped from body and query', async () => {
    const res = await post(`/test/users/${VALID_ID}?role=donor&debug=1`, {
      email: 'A@Example.org',
      password: 'correct horse',
      isAdmin: true,
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      params: { id: VALID_ID },
      query: { role: 'donor' },
      body: { email: 'a@example.org', password: 'correct horse' },
    });
  });
});

describe('errors', () => {
  test('an unknown route returns not found', async () => {
    const res = await fetch(`${baseUrl}/api/no-such-route`);

    expect(res.status).toBe(404);
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('NOT_FOUND');
  });

  test('a domain error returns its own code', async () => {
    const res = await fetch(`${baseUrl}/test/claimed`);

    expect(res.status).toBe(409);
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('OFFER_UNAVAILABLE');
  });

  test('an unexpected error returns internal with no detail and logs the stack', async () => {
    const res = await fetch(`${baseUrl}/test/crash`);

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(ErrorEnvelope.parse(JSON.parse(text)).error.code).toBe('INTERNAL');
    expect(text).not.toContain('db-host-17');
    expect(text).not.toContain('at ');
    expect(logs()).toContain('connection to db-host-17 refused');
    expect(logs()).toContain('app.test.ts');
  });

  test('a JSON body over 100 kB is rejected before validation runs', async () => {
    const send = (size: number) =>
      post(`/test/users/${VALID_ID}`, { email: 'a@example.org', password: 'x'.repeat(size) });

    const under = ErrorEnvelope.parse(await (await send(90_000)).json());
    const over = await send(110_000);

    expect(under.error.fields).toHaveProperty('password');
    expect(over.status).toBe(400);
    const body = ErrorEnvelope.parse(await over.json());
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.fields).toBeUndefined();
    expect(body.error.message).toMatch(/too large/);
  });
});

describe('security headers', () => {
  test('responses carry the content security policy', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    const directives = (res.headers.get('content-security-policy') ?? '').split(';');
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("img-src 'self' https://res.cloudinary.com data:");
    expect(directives).toContain("connect-src 'self'");
    expect(directives).toContain("script-src 'self'");
  });

  test('API responses may not be cached, errors included', async () => {
    for (const path of ['/api/health', '/api/no-such-route']) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.headers.get('cache-control'), path).toBe('no-store');
    }
  });
});

describe('logging', () => {
  test('cookies and authorisation headers are redacted', async () => {
    await fetch(`${baseUrl}/api/health`, {
      headers: { cookie: 'sid=cookie-value-123', authorization: 'Bearer token-value-456' },
    });

    expect(logs()).toContain('[redacted]');
    expect(logs()).not.toContain('cookie-value-123');
    expect(logs()).not.toContain('token-value-456');
  });

  test('passwords are redacted, including nested ones', () => {
    logger.info({ body: { password: 'top-level-secret', user: { password: 'nested-secret' } } });

    expect(logs()).not.toContain('top-level-secret');
    expect(logs()).not.toContain('nested-secret');
  });

  test('the CSRF token header is redacted', async () => {
    await post(`/test/users/${VALID_ID}`, { email: 'a@example.org', password: 'correct horse' });

    // the request is logged when the response finishes, which can trail the client a little
    await vi.waitFor(() => expect(logs()).toContain('x-csrf-token'));
    expect(logs()).not.toContain(client.csrfToken);
  });

  test('password hashes are redacted', () => {
    logger.info({ user: { passwordHash: '$2b$12$hash-value-789' } });

    expect(logs()).not.toContain('hash-value-789');
  });
});

describe('CSRF', () => {
  const body = { email: 'a@example.org', password: 'correct horse' };

  test('a state-changing request without a token is refused', async () => {
    const token = client.csrfToken;
    client.csrfToken = '';
    const res = await client.post(`/test/users/${VALID_ID}`, body);
    client.csrfToken = token;

    expect(res.status).toBe(403);
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('CSRF_INVALID');
  });

  test('a state-changing request with the wrong token is refused', async () => {
    const res = await client.request('POST', `/test/users/${VALID_ID}`, body, {
      'X-CSRF-Token': 'x'.repeat(client.csrfToken.length),
    });

    expect(res.status).toBe(403);
    expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('CSRF_INVALID');
  });

  test('a token from another session is refused', async () => {
    const other = new TestClient(baseUrl);
    await other.fetchCsrfToken();

    const res = await client.request('POST', `/test/users/${VALID_ID}`, body, {
      'X-CSRF-Token': other.csrfToken,
    });

    expect(res.status).toBe(403);
  });

  test('Twilio webhooks need no token', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/twilio/test`, { method: 'POST' });

    expect(res.status).toBe(204);
  });
});

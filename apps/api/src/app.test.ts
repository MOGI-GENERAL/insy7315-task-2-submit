import type { AddressInfo } from 'node:net';
import {
  ErrorEnvelope,
  HealthResponse,
  idParams,
  ListUsersQuery,
  LoginRequest,
} from '@fedsa/contract';
import { Router } from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { createApp } from './app.js';
import { OfferUnavailableError } from './errors.js';
import { createLogger } from './logger.js';
import { validate } from './middleware/validate.js';
import { HealthService } from './services/health-service.js';

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

const server = createApp({
  logger,
  services: { health: new HealthService(fakeHealthRepository, 'test-sha') },
  extraRouters: [throwaway],
}).listen(0);
let baseUrl = '';

beforeAll(() => {
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
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
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
});

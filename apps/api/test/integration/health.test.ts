import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HealthResponse } from '@fedsa/contract';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createApp } from '../../src/app.js';
import { HealthRepository } from '../../src/db/index.js';
import { createLogger } from '../../src/logger.js';
import { HealthService } from '../../src/services/health-service.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;
let server: Server | undefined;
let baseUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  server = createApp({
    logger: createLogger({ write: () => {} }),
    services: { health: new HealthService(new HealthRepository(), 'test-sha') },
  }).listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, START_TIMEOUT_MS);

afterAll(async () => {
  server?.close();
  await stopTestDb?.();
});

test('health reports the database as up', async () => {
  const res = await fetch(`${baseUrl}/api/health`);

  expect(res.status).toBe(200);
  expect(HealthResponse.parse(await res.json())).toEqual({
    ok: true,
    version: 'test-sha',
    db: 'up',
  });
});

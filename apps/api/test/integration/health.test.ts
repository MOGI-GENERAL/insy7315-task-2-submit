import { HealthResponse } from '@fedsa/contract';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { startTestApp } from './test-app.js';
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

test('health reports the database as up', async () => {
  const res = await fetch(`${baseUrl}/api/health`);

  expect(res.status).toBe(200);
  expect(HealthResponse.parse(await res.json())).toEqual({
    ok: true,
    version: 'test-sha',
    db: 'up',
  });
});

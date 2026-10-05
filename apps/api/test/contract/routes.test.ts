import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ERROR_STATUS,
  ErrorEnvelope,
  ROUTES,
  SessionResponse,
  routeKey,
  type RouteSpec,
} from '@fedsa/contract';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { z } from 'zod';
import { OfferModel, OrganisationModel } from '../../src/db/index.js';
import { LocalPhotoStore } from '../../src/photos/local-photo-store.js';
import { runSeed } from '../../src/seed/seed.js';
import {
  newHandoverService,
  newNotificationService,
  newOfferService,
  startTestApp,
} from '../integration/test-app.js';
import { START_TIMEOUT_MS, startTestDb } from '../integration/test-db.js';
import { CONTRACT_CASES, NOT_YET_SERVED } from './cases.js';
import { ContractContext, SEED_PASSWORD } from './context.js';
import { routeFor, servedRoutes } from './served-routes.js';
import { describeIssues, strictSchema } from './strict-schema.js';

const notifications = newNotificationService({ vapidPublicKey: 'contract-test-vapid-key' });

let stopTestDb: (() => Promise<void>) | undefined;
const closers: (() => Promise<void>)[] = [];
let photoDir = '';
let app: Express;
let t: ContractContext;

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const seededAt = new Date();
  await runSeed({ password: SEED_PASSWORD, now: seededAt });

  photoDir = await mkdtemp(join(tmpdir(), 'fedsa-contract-photos-'));
  const photos = new LocalPhotoStore(photoDir);
  const offers = newOfferService({ photos, notifier: notifications });
  const main = await startTestApp(
    [],
    offers,
    notifications,
    undefined,
    undefined,
    newHandoverService(offers, { photos, notifications }),
  );
  const pushOff = await startTestApp();
  closers.push(main.close, pushOff.close);
  app = main.app;
  t = new ContractContext(main.baseUrl, pushOff.baseUrl, seededAt);

  // the seed writes no notifications. St Michael's is told about an open offer to give it one
  const produce = (await OfferModel.findOne({ title: 'Mixed produce, full pallet' }))!;
  const stMichaels = (await OrganisationModel.findOne({ name: "St Michael's Night Shelter" }))!;
  const [view] = await offers.toViews([produce]);
  await notifications.notifyEligible(view!, [stMichaels._id.toHexString()]);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await notifications.whenIdle();
  for (const close of closers) await close();
  await stopTestDb?.();
  if (photoDir) await rm(photoDir, { recursive: true, force: true });
});

/** a body that is not JSON, such as TwiML, reads as undefined and fails any schema check */
async function readBody(res: Response) {
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { text, json };
}

/** fails with every field that does not match, rather than the first */
function parseStrictly(schema: z.ZodType, body: unknown, label: string) {
  const result = strictSchema(schema).safeParse(body);
  if (!result.success) {
    expect.fail(`${label} does not match the contract:\n${describeIssues(result.error)}`);
  }
  return result.data;
}

for (const route of ROUTES as readonly RouteSpec[]) {
  const key = routeKey(route);
  const contractCase = CONTRACT_CASES[key as keyof typeof CONTRACT_CASES];
  if (!contractCase) continue;

  describe(key, () => {
    test(`success is ${route.status}`, async () => {
      const res = await contractCase.success(t);
      const { text, json } = await readBody(res);
      expect(res.status, text).toBe(route.status);

      if (route.response) parseStrictly(route.response, json, `${key} ${res.status}`);
      else if (route.status === 302) expect(res.headers.get('location')).toBeTruthy();
      else if (route.status === 201 || route.status === 204) expect(text).toBe('');
      else expect(text).not.toBe('');
    });

    const { code, send } = contractCase.error;
    test(`error is ${ERROR_STATUS[code]} ${code}`, async () => {
      const res = await send(t);
      const { text, json } = await readBody(res);
      expect(res.status, text).toBe(ERROR_STATUS[code]);

      const body = parseStrictly(ErrorEnvelope, json, `${key} ${res.status}`) as ErrorEnvelope;
      expect(body.error.code).toBe(code);
    });
  });
}

describe('completeness', () => {
  const isServed = (key: string) => {
    const [method, path] = key.split(' ');
    return routeFor(app, method!, path!) !== null;
  };
  const tested = new Set(Object.keys(CONTRACT_CASES));
  const tableKeys = ROUTES.map(routeKey);

  test('every route the app serves has a contract test', () => {
    const untested = tableKeys.filter((key) => isServed(key) && !tested.has(key));
    expect(untested, 'served without a contract test').toEqual([]);
  });

  test('every route the app serves is in the routes table', () => {
    const reached = ROUTES.map((r) => ({
      method: r.method,
      route: routeFor(app, r.method, r.path),
    }));
    const unlisted = servedRoutes(app)
      .filter((s) => !reached.some((r) => r.method === s.method && r.route === s.route))
      .map((s) => `${s.method} ${s.path}`);
    expect(unlisted, 'served but not in the routes table, as written in the router').toEqual([]);
  });

  test('no route listed as not yet served is served', () => {
    const served = NOT_YET_SERVED.filter(isServed);
    expect(served, 'served now, so each needs a contract test and to leave the list').toEqual([]);
  });

  test('every route in the table is tested or listed as not yet served', () => {
    const accounted = new Set<string>([...tested, ...NOT_YET_SERVED]);
    expect(tableKeys.filter((key) => !accounted.has(key))).toEqual([]);
  });

  // the cases reach these routes over HTTP. a miss here means the lookup itself is wrong
  test('the lookup finds every route a case calls', () => {
    expect([...tested].filter((key) => !isServed(key))).toEqual([]);
  });
});

test('the strict copy of a schema refuses an extra field at any depth', async () => {
  const res = await (await t.client('riaan')).get('/api/me');
  const body = (await res.json()) as { user: Record<string, unknown> };
  const strict = strictSchema(SessionResponse);

  expect(strict.safeParse(body).success).toBe(true);
  expect(strict.safeParse({ ...body, extra: 1 }).success).toBe(false);
  expect(strict.safeParse({ ...body, user: { ...body.user, passwordHash: 'x' } }).success).toBe(
    false,
  );
  expect(strict.safeParse({ ...body, user: { ...body.user, email: undefined } }).success).toBe(
    false,
  );
});

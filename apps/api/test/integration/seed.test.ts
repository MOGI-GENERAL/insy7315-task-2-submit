import {
  ClaimStatus,
  ImpactResponse,
  OfferStatus,
  OrganisationListResponse,
  OutcomesResponse,
  SessionResponse,
} from '@fedsa/contract';
import mongoose from 'mongoose';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  ClaimModel,
  CollectionModel,
  CounterModel,
  HandoverRecordModel,
  MANAGED,
  OfferModel,
  OrganisationModel,
  SESSIONS_COLLECTION,
  UserModel,
  ValuationRateModel,
} from '../../src/db/index.js';
import { isEligible } from '../../src/services/eligibility.js';
import { canClaim } from '../../src/services/organisation-status.js';
import { SEED_RADIUS_KM, seedPeriod } from '../../src/seed/records.js';
import { DONORS, NADIA, RECIPIENTS, ZANELE } from '../../src/seed/scenario.js';
import { SeedRefusedError, runSeed, type CollectionResult } from '../../src/seed/seed.js';
import { createOrganisation, signedInClient, startTestApp } from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

/** only ever used against the in-memory database */
const SEED_TEST_PASSWORD = 'seed accounts in tests';

const NOW = new Date('2026-10-04T15:30:00+02:00');
const DAY = 24 * 60 * 60 * 1000;

const RIAAN = DONORS[0]!.person;
const NOSIPHO = RECIPIENTS[0]!.person;

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let firstRun: CollectionResult[] = [];

beforeAll(async () => {
  stopTestDb = await startTestDb();
  firstRun = await runSeed({ password: SEED_TEST_PASSWORD, now: NOW });
  const app = await startTestApp();
  baseUrl = app.baseUrl;
  closeApp = app.close;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

async function snapshot() {
  const all: Record<string, unknown[]> = {};
  for (const { model } of MANAGED) {
    const name = model.collection.collectionName;
    all[name] = await model.collection.find().sort({ _id: 1 }).toArray();
  }
  return all;
}

async function counts() {
  const all: Record<string, number> = {};
  for (const { model } of MANAGED) {
    all[model.collection.collectionName] = await model.countDocuments();
  }
  return all;
}

test('every seeded document passes the collection validators and the model rules', async () => {
  expect(firstRun.find((r) => r.name === 'offers')!.inserted).toBeGreaterThan(100);

  for (const { model, validator } of MANAGED) {
    const name = model.collection.collectionName;
    expect(await model.collection.countDocuments({ $nor: [validator] }), name).toBe(0);
    for (const doc of await model.find()) await doc.validate();
  }
});

test('a second run in the same minute changes nothing', async () => {
  const before = await snapshot();

  const second = await runSeed({ password: SEED_TEST_PASSWORD, now: NOW });

  for (const result of second) {
    expect(result, result.name).toMatchObject({ inserted: 0, updated: 0, deleted: 0 });
  }
  expect(await snapshot()).toEqual(before);
});

test('a run on a later day moves the history rather than adding to it', async () => {
  const before = await counts();

  await runSeed({ password: SEED_TEST_PASSWORD, now: new Date(NOW.getTime() + DAY) });
  expect(await counts()).toEqual(before);

  await runSeed({ password: SEED_TEST_PASSWORD, now: NOW });
  expect(await counts()).toEqual(before);
});

test('the history holds every state the screens show', async () => {
  for (const status of OfferStatus.options) {
    expect(await OfferModel.countDocuments({ status }), status).toBeGreaterThan(0);
  }
  for (const status of ClaimStatus.options) {
    expect(await ClaimModel.countDocuments({ status }), status).toBeGreaterThan(0);
  }
  expect(
    await HandoverRecordModel.countDocuments({ recipientConfirmedAt: { $ne: null } }),
  ).toBeGreaterThan(50);
  expect(await HandoverRecordModel.countDocuments({ recipientConfirmedAt: null })).toBeGreaterThan(
    0,
  );
  expect(
    await HandoverRecordModel.countDocuments({ conditionOnReceipt: 'problem' }),
  ).toBeGreaterThan(0);
  expect(await OfferModel.countDocuments({ parentOfferId: { $ne: null } })).toBeGreaterThan(0);
  expect(await CollectionModel.countDocuments({ status: 'completed' })).toBeGreaterThan(0);
  expect(await ValuationRateModel.countDocuments({ updatedByUserId: null })).toBe(6);

  const needsDriver = await ClaimModel.find({ status: 'active', transportNeeded: true });
  const dispatched = await CollectionModel.distinct('claimId');
  expect(needsDriver.some((c) => !dispatched.some((id) => id.equals(c._id)))).toBe(true);
});

test('no seeded phone number or email can reach a real person', async () => {
  const phones = [
    ...(await UserModel.distinct('phone')),
    ...(await OrganisationModel.distinct('contactPhone')),
    ...(await CollectionModel.distinct('driverPhone')),
  ];
  for (const phone of phones) expect(phone).toMatch(/^\+270/);

  const emails = [
    ...(await UserModel.distinct('email')),
    ...(await OrganisationModel.distinct('contactEmail')),
  ];
  for (const email of emails) expect(email).toMatch(/\.example$/);
});

test('every role can sign in with the seeded password', async () => {
  const accounts = [
    [RIAAN.email, 'donor'],
    [NOSIPHO.email, 'recipient'],
    [NADIA.email, 'coordinator'],
    [ZANELE.email, 'administrator'],
  ];
  for (const [email, role] of accounts) {
    const client = await signedInClient(baseUrl, email!, SEED_TEST_PASSWORD);
    const me = SessionResponse.parse(await (await client.get('/api/me')).json());
    expect(me.user.role).toBe(role);
  }
});

test('the reports over the six weeks have figures and the outcomes add up', async () => {
  const admin = await signedInClient(baseUrl, ZANELE.email, SEED_TEST_PASSWORD);
  const { from, to } = seedPeriod(NOW);

  const impactRes = await admin.get(`/api/reports/impact?from=${from}&to=${to}`);
  const impact = ImpactResponse.parse(await impactRes.json());
  expect(impact.totals.kg).toBeGreaterThan(1000);
  expect(impact.totals.meals).toBeGreaterThan(0);

  const outcomesRes = await admin.get(`/api/reports/outcomes?from=${from}&to=${to}`);
  const outcomes = OutcomesResponse.parse(await outcomesRes.json());
  expect(outcomes.posted).toBe(await OfferModel.countDocuments());
  expect(
    outcomes.open +
      outcomes.claimed +
      outcomes.collected +
      outcomes.expiredUnclaimed +
      outcomes.expiredClaimed +
      outcomes.cancelled,
  ).toBe(outcomes.posted);
  for (const key of [
    'open',
    'claimed',
    'collected',
    'expiredUnclaimed',
    'expiredClaimed',
    'cancelled',
  ] as const) {
    expect(outcomes[key], key).toBeGreaterThan(0);
  }
  expect(outcomes.distinctRecipients).toBeGreaterThan(0);
});

test('no recipient takes most of the food', async () => {
  const admin = await signedInClient(baseUrl, ZANELE.email, SEED_TEST_PASSWORD);
  const { from, to } = seedPeriod(NOW);

  const res = await admin.get(`/api/reports/impact?from=${from}&to=${to}&groupBy=recipient`);
  const impact = ImpactResponse.parse(await res.json());
  const shares = impact.rows.map((row) => row.kg / impact.totals.kg);

  for (const [i, share] of shares.entries()) {
    expect(share, impact.rows[i]!.label).toBeLessThanOrEqual(0.35);
  }
  expect(shares.filter((share) => share >= 0.1).length).toBeGreaterThanOrEqual(4);
});

test('every claim is one the matching rule would have shown that recipient', async () => {
  const organisations = await OrganisationModel.find();
  const byId = new Map(organisations.map((o) => [o._id.toHexString(), o]));
  const offers = new Map((await OfferModel.find()).map((o) => [o._id.toHexString(), o]));

  for (const claim of await ClaimModel.find()) {
    const offer = offers.get(claim.offerId.toHexString())!;
    const donor = byId.get(offer.donorOrganisationId.toHexString())!;
    const recipient = byId.get(claim.recipientOrganisationId.toHexString())!;
    expect(
      isEligible(recipient, offer, donor.location.coordinates, SEED_RADIUS_KM),
      `${recipient.name} on ${offer.reference}`,
    ).toBe(true);
  }
});

test("the coordinator's verification queue has a pending recipient", async () => {
  const coordinator = await signedInClient(baseUrl, NADIA.email, SEED_TEST_PASSWORD);

  const res = await coordinator.get('/api/organisations?type=recipient&status=pending');
  const { items } = OrganisationListResponse.parse(await res.json());

  expect(items.map((o) => o.name)).toContain('Hope Kitchen');
});

test("the demo starts with Ouma's Bakery free to post and both shelters able to claim", async () => {
  const ouma = (await OrganisationModel.findOne({ name: "Ouma's Bakery" }))!;
  const riaan = (await UserModel.findOne({ email: RIAAN.email }))!;
  expect(ouma.status).toBe('active');
  expect(riaan.status).toBe('active');
  expect(riaan.mustChangePassword).toBe(false);
  expect(await OfferModel.countDocuments({ donorOrganisationId: ouma._id, status: 'open' })).toBe(
    0,
  );

  const bread = { coldChain: 'ambient', offeredQuantityKg: 31 } as const;
  for (const name of ['Siyakhula Shelter', "St Michael's Night Shelter"]) {
    const shelter = (await OrganisationModel.findOne({ name }))!;
    expect(canClaim(shelter), name).toBe(true);
    expect(isEligible(shelter, bread, ouma.location.coordinates, SEED_RADIUS_KM), name).toBe(true);
  }
});

test('it refuses a database holding records it did not write, and a reset clears them', async () => {
  const stranger = await createOrganisation({ type: 'donor', name: 'Not From The Seed' });
  await CounterModel.create({ name: 'taxCertificates', year: 2026, seq: 3 });

  await expect(runSeed({ password: SEED_TEST_PASSWORD, now: NOW })).rejects.toThrow(
    SeedRefusedError,
  );
  expect(await OrganisationModel.exists({ _id: stranger._id })).not.toBeNull();

  await runSeed({ password: SEED_TEST_PASSWORD, now: NOW, reset: true });
  expect(await OrganisationModel.exists({ _id: stranger._id })).toBeNull();
  expect(await CounterModel.countDocuments()).toBe(0);
  expect(await OrganisationModel.exists({ name: "Ouma's Bakery" })).not.toBeNull();
  expect(await mongoose.connection.collection(SESSIONS_COLLECTION).countDocuments()).toBe(0);
});

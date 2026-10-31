import { randomBytes } from 'node:crypto';
import { DriverCollectionResponse, ErrorEnvelope } from '@fedsa/contract';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  CollectionModel,
  NotificationModel,
  OfferModel,
  OrganisationModel,
  RateLimitModel,
} from '../../src/db/index.js';
import { MemoryChannel } from '../../src/notifications/memory-channel.js';
import { hashDriverToken } from '../../src/services/collection-service.js';
import type { TestClient } from '../test-client.js';
import {
  anonymousClient,
  createOrganisation,
  createUser,
  newClaimService,
  newCollectionService,
  newNotificationService,
  newOfferService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

const WEB_ORIGIN = 'https://web.example.org';
const sms = new MemoryChannel('sms');
const notifications = newNotificationService({ channels: [sms] });

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const offers = newOfferService({ notifier: notifications });
  const app = await startTestApp(
    [],
    offers,
    notifications,
    newClaimService(offers),
    undefined,
    undefined,
    newCollectionService(notifications, WEB_ORIGIN),
  );
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

beforeEach(async () => {
  await settle();
  sms.sent.length = 0;
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    CollectionModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    RateLimitModel.deleteMany({}),
  ]);
});

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));
const newToken = () => randomBytes(32).toString('base64url');

let referenceCount = 0;

async function claimedOffer() {
  const donor = await createOrganisation({ type: 'donor', name: 'Kaap Foods' });
  const donorUser = await createUser({ role: 'donor', organisationId: donor._id });
  referenceCount += 1;
  const offer = await OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: donorUser._id,
    reference: `L${referenceCount.toString().padStart(3, '0')}`,
    title: '62 loaves and 40 rolls',
    description: 'Keep the rolls dry',
    category: 'bakery',
    offeredQuantityKg: 31,
    coldChain: 'ambient',
    photoUrls: ['https://local-photos.invalid/loaves.jpg'],
    availableFrom: inHours(-1),
    collectionDeadline: inHours(3),
    status: 'open',
  });
  const recipientOrg = await createOrganisation({
    type: 'recipient',
    name: 'Siyakhula Shelter',
    hasTransport: false,
  });
  const recipientUser = await createUser({ role: 'recipient', organisationId: recipientOrg._id });
  const recipient = await signedInClient(baseUrl, recipientUser.email);
  const claimed = await recipient.post(`/api/offers/${offer._id.toString()}/claim`, {
    transportNeeded: true,
  });
  expect(claimed.status).toBe(201);
  const claim = (await ClaimModel.findOne({ offerId: offer._id }))!;
  return { donor, offer, recipientOrg, recipient, claim };
}

async function coordinator() {
  const user = await createUser({ role: 'coordinator' });
  return signedInClient(baseUrl, user.email);
}

const dispatchBody = (overrides: object = {}) => ({
  driverName: 'Themba Mokoena',
  driverPhone: '+27821112222',
  scheduledFor: inHours(1).toISOString(),
  ...overrides,
});

async function read(pending: Promise<Response>) {
  const res = await pending;
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null, res };
}

const dispatch = (client: TestClient, claimId: unknown, body: object) =>
  read(client.post(`/api/claims/${String(claimId)}/collection`, body));

const rotate = (client: TestClient, collectionId: unknown, driverToken: string) =>
  read(
    client.request('PUT', `/api/collections/${String(collectionId)}/driver-link`, { driverToken }),
  );

async function visit(token: string) {
  return read((await anonymousClient(baseUrl)).get(`/api/driver-collections/${token}`));
}

/** a dispatched collection whose driver link is `token` */
async function linked(deadlineHours = 3) {
  const world = await claimedOffer();
  const token = newToken();
  const nadia = await coordinator();
  const dispatched = await dispatch(nadia, world.claim._id, dispatchBody({ driverToken: token }));
  expect(dispatched.status).toBe(201);
  // a claim needs an open deadline. move it afterwards
  await OfferModel.updateOne(
    { _id: world.offer._id },
    { collectionDeadline: inHours(deadlineHours) },
  );
  const collection = (await CollectionModel.findOne({ claimId: world.claim._id }))!;
  return { ...world, token, nadia, collection };
}

describe('the driver link page', () => {
  test('shows the collection to anyone holding the token, with no-cache headers', async () => {
    const { token, offer, donor, recipientOrg } = await linked();

    const { status, body, res } = await visit(token);

    expect(status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    const page = DriverCollectionResponse.strict().parse(body);
    expect(page).toMatchObject({
      reference: offer.reference,
      title: '62 loaves and 40 rolls',
      category: 'bakery',
      quantityKg: 31,
      coldChain: 'ambient',
      driverName: 'Themba Mokoena',
      pickup: {
        organisationName: 'Kaap Foods',
        address: `${donor.addressLine}, ${donor.suburb}`,
        contactName: donor.contactName,
        contactPhone: donor.contactPhone,
      },
      dropOff: {
        organisationName: 'Siyakhula Shelter',
        address: `${recipientOrg.addressLine}, ${recipientOrg.suburb}`,
      },
    });
  });

  test('never contains the hash, an email or a photo', async () => {
    const { token, donor, recipientOrg } = await linked();

    const { body } = await visit(token);

    const text = JSON.stringify(body);
    expect(text).not.toContain(hashDriverToken(token));
    expect(text).not.toContain(token);
    expect(text).not.toContain(donor.contactEmail);
    expect(text).not.toContain(recipientOrg.contactEmail);
    expect(text).not.toMatch(/@|photo|thumb|Id"/i);
  });

  test('stores only the hash of the token', async () => {
    const { token, collection } = await linked();

    expect(collection.driverTokenHash).toBe(hashDriverToken(token));
    expect(JSON.stringify(collection.toObject())).not.toContain(token);
    await settle();
    const stored = await NotificationModel.find({ channel: 'sms' });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.body).not.toContain(token);
    expect(stored[0]?.body).toContain(`${WEB_ORIGIN}/c/[token]`);
  });

  test('is not in the collection the coordinator gets back', async () => {
    const { claim } = await claimedOffer();
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id, dispatchBody({ driverToken: newToken() }));

    expect(JSON.stringify(res.body)).not.toMatch(/hash|token/i);
  });

  describe('answers the same 404 for every dead link', () => {
    async function expectDead(token: string, reference: { status: number; body: unknown }) {
      const res = await visit(token);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(reference.body);
      expect(res.res.headers.get('cache-control')).toBe('no-store');
      expect(res.res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.res.headers.get('x-robots-tag')).toBe('noindex');
      expect(ErrorEnvelope.parse(res.body).error.code).toBe('NOT_FOUND');
    }

    let unknown: { status: number; body: unknown };
    beforeEach(async () => {
      unknown = await visit(newToken());
      expect(unknown.status).toBe(404);
    });

    test('unknown token', async () => {
      await linked();
      await expectDead(newToken(), unknown);
    });

    test('malformed token', async () => {
      await expectDead('short', unknown);
      await expectDead('!'.repeat(43), unknown);
    });

    test('completed collection', async () => {
      const { token, nadia, collection } = await linked();
      await nadia.request('PATCH', `/api/collections/${collection._id.toString()}`, {
        status: 'completed',
      });
      await expectDead(token, unknown);
    });

    test('cancelled collection', async () => {
      const { token, nadia, collection } = await linked();
      await nadia.request('PATCH', `/api/collections/${collection._id.toString()}`, {
        status: 'cancelled',
      });
      await expectDead(token, unknown);
    });

    test('released claim', async () => {
      const { token, recipient, claim } = await linked();
      const released = await recipient.post(`/api/claims/${claim._id.toString()}/release`, {});
      expect(released.status).toBe(200);
      await expectDead(token, unknown);
    });

    test('more than a day past the collection deadline', async () => {
      const { token } = await linked(-25);
      await expectDead(token, unknown);
    });
  });

  test('still works within a day after the collection deadline', async () => {
    const { token } = await linked(-23);

    expect((await visit(token)).status).toBe(200);
  });

  test('is refused with the same headers once the address has asked too often', async () => {
    const client = await anonymousClient(baseUrl);
    let last: Response | undefined;
    for (let i = 0; i < 31; i += 1) {
      last = await client.get(`/api/driver-collections/${newToken()}`);
    }

    expect(last?.status).toBe(429);
    expect(last?.headers.get('cache-control')).toBe('no-store');
    expect(last?.headers.get('x-robots-tag')).toBe('noindex');
  });
});

describe('dispatching with a token', () => {
  test('texts the driver the link', async () => {
    const { claim } = await claimedOffer();
    const nadia = await coordinator();
    const token = newToken();

    await dispatch(nadia, claim._id, dispatchBody({ driverToken: token }));
    await settle();

    expect(sms.sentTo('+27821112222')[0]!.phoneText).toContain(`${WEB_ORIGIN}/c/${token}`);
  });

  test('sends no link without a token', async () => {
    const { claim } = await claimedOffer();
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id, dispatchBody());
    await settle();

    expect(res.status).toBe(201);
    expect(sms.sentTo('+27821112222')[0]!.phoneText).not.toMatch(/https?:\/\//);
    expect((await CollectionModel.findOne())?.driverTokenHash).toBeNull();
  });

  test('refuses a token another collection already uses', async () => {
    const { token } = await linked();
    const { claim } = await claimedOffer();
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id, dispatchBody({ driverToken: token }));

    expect(res.status).toBe(400);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    expect(await CollectionModel.countDocuments()).toBe(1);
  });

  test('rejects a token of the wrong shape', async () => {
    const { claim } = await claimedOffer();
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id, dispatchBody({ driverToken: 'abc' }));

    expect(res.status).toBe(400);
  });

  test('a repeat dispatch with a different token keeps the first token and kills the second', async () => {
    const { claim, token, nadia } = await linked();
    const second = newToken();

    const repeat = await dispatch(nadia, claim._id, dispatchBody({ driverToken: second }));

    expect(repeat.status).toBe(200);
    expect((await visit(token)).status).toBe(200);
    expect((await visit(second)).status).toBe(404);
  });
});

describe('sharing the link again', () => {
  test('replaces the token, so the old link dies and the new one works', async () => {
    const { token, nadia, collection } = await linked();
    const fresh = newToken();

    const res = await rotate(nadia, collection._id, fresh);

    expect(res.status).toBe(204);
    expect((await visit(token)).status).toBe(404);
    expect((await visit(fresh)).status).toBe(200);
    const audit = await AuditLogModel.find({ action: 'rotate_driver_link' });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.targetId.toString()).toBe(collection._id.toString());
  });

  test('refuses a signed-out caller', async () => {
    const { collection } = await linked();
    const anonymous = await anonymousClient(baseUrl);

    const res = await read(
      anonymous.request('PUT', `/api/collections/${collection._id.toString()}/driver-link`, {
        driverToken: newToken(),
      }),
    );

    expect(res.status).toBe(401);
  });

  test('refuses a request without the CSRF token', async () => {
    const { token, nadia, collection } = await linked();
    nadia.csrfToken = '';

    const res = await rotate(nadia, collection._id, newToken());

    expect(res.status).toBe(403);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('CSRF_INVALID');
    expect((await visit(token)).status).toBe(200);
  });

  test('refuses a token another collection holds', async () => {
    const first = await linked();
    const second = await linked();

    const res = await rotate(second.nadia, second.collection._id, first.token);

    expect(res.status).toBe(400);
    expect((await visit(second.token)).status).toBe(200);
  });

  test('is for coordinators only', async () => {
    const { token, recipient, collection } = await linked();

    const res = await rotate(recipient, collection._id, newToken());

    expect(res.status).toBe(403);
    expect((await visit(token)).status).toBe(200);
  });

  test('is refused once the collection is closed', async () => {
    const { nadia, collection } = await linked();
    await nadia.request('PATCH', `/api/collections/${collection._id.toString()}`, {
      status: 'completed',
    });

    const res = await rotate(nadia, collection._id, newToken());

    expect(res.status).toBe(409);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('INVALID_STATE');
  });

  test('answers an unknown collection with 404', async () => {
    const nadia = await coordinator();

    const res = await rotate(nadia, '0'.repeat(24), newToken());

    expect(res.status).toBe(404);
  });
});

import { CollectionResponse, ErrorEnvelope } from '@fedsa/contract';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  CollectionModel,
  OfferModel,
  OrganisationModel,
} from '../../src/db/index.js';
import { MemoryChannel } from '../../src/notifications/memory-channel.js';
import type { NotificationService } from '../../src/services/notification-service.js';
import type { TestClient } from '../test-client.js';
import {
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

const sms = new MemoryChannel('sms');
const notifications = newNotificationService({ channels: [sms] });

/** what the collection looked like in the database at the moment the text went out */
const seenAtSend: { phone: string; collectionExisted: boolean }[] = [];
const watchingNotifications: Pick<NotificationService, 'sendSms'> = {
  async sendSms(to, ...rest) {
    seenAtSend.push({ phone: to, collectionExisted: (await CollectionModel.countDocuments()) > 0 });
    return notifications.sendSms(to, ...rest);
  },
};

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
    newCollectionService(watchingNotifications),
  );
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

beforeEach(async () => {
  // the last test's text goes out after its reply
  await settle();
  sms.sent.length = 0;
  seenAtSend.length = 0;
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    CollectionModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);
});

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

let referenceCount = 0;

/** an offer posted by a donor and claimed by a recipient without transport */
async function claimedOffer(fields: { transportNeeded: boolean; title?: string }) {
  const donor = await createOrganisation({ type: 'donor', name: 'Kaap Foods' });
  const donorUser = await createUser({ role: 'donor', organisationId: donor._id });
  referenceCount += 1;
  const offer = await OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: donorUser._id,
    reference: `D${referenceCount.toString().padStart(3, '0')}`,
    title: fields.title ?? '62 loaves and 40 rolls',
    description: null,
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
    transportNeeded: fields.transportNeeded,
  });
  expect(claimed.status).toBe(201);
  const claim = (await ClaimModel.findOne({ offerId: offer._id }))!;
  return { donor, offer, recipientOrg, recipient, claim };
}

const dispatchBody = (overrides: object = {}) => ({
  driverName: 'Themba Mokoena',
  driverPhone: '+27821112222',
  scheduledFor: inHours(1).toISOString(),
  ...overrides,
});

async function coordinator() {
  const user = await createUser({ role: 'coordinator' });
  return signedInClient(baseUrl, user.email);
}

async function read(pending: Promise<Response>) {
  const res = await pending;
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as unknown) : null };
}

const dispatch = (client: TestClient, claimId: unknown, body: object = dispatchBody()) =>
  read(client.post(`/api/claims/${String(claimId)}/collection`, body));

const update = (client: TestClient, id: unknown, status: string) =>
  read(client.request('PATCH', `/api/collections/${String(id)}`, { status }));

/** the text goes out in the background, after the reply */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

function errorCode(body: unknown) {
  return ErrorEnvelope.parse(body).error.code;
}

describe('dispatching a driver', () => {
  test('creates a dispatched collection for a claim that needs transport and audits it', async () => {
    const { claim } = await claimedOffer({ transportNeeded: true });
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id);

    expect(res.status).toBe(201);
    const { collection } = CollectionResponse.strict().parse(res.body);
    expect(collection).toMatchObject({
      claimId: claim._id.toString(),
      driverName: 'Themba Mokoena',
      driverPhone: '+27821112222',
      status: 'dispatched',
    });
    const audit = await AuditLogModel.find({ action: 'dispatch_driver' });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.targetId.toString()).toBe(collection.id);
  });

  test('texts the driver once, after the commit, with only this collection', async () => {
    const other = await claimedOffer({ transportNeeded: true, title: 'Secret other offer' });
    const { claim, offer, donor, recipientOrg } = await claimedOffer({ transportNeeded: true });
    const nadia = await coordinator();

    await dispatch(nadia, claim._id);
    await settle();

    expect(seenAtSend).toEqual([{ phone: '+27821112222', collectionExisted: true }]);
    const messages = sms.sentTo('+27821112222');
    expect(messages).toHaveLength(1);
    const text = messages[0]!.phoneText;
    expect(text).toContain(offer.reference);
    expect(text).toContain(`${donor.addressLine}, ${donor.suburb}`);
    expect(text).toContain(donor.contactName);
    expect(text).toContain(donor.contactPhone);
    expect(text).toContain(`${recipientOrg.addressLine}, ${recipientOrg.suburb}`);
    expect(text).not.toContain(other.offer.reference);
    expect(text).not.toContain('Secret other offer');
    expect(text).not.toMatch(/https?:\/\//);
    expect(sms.sent).toHaveLength(1);
  });

  test('refuses a claim that did not ask for transport, and texts nobody', async () => {
    const { claim } = await claimedOffer({ transportNeeded: false });
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id);
    await settle();

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('INVALID_STATE');
    expect(await CollectionModel.countDocuments()).toBe(0);
    expect(sms.sent).toHaveLength(0);
  });

  test('refuses a released claim', async () => {
    const { claim, recipient } = await claimedOffer({ transportNeeded: true });
    const released = await recipient.post(`/api/claims/${claim._id.toString()}/release`, {});
    expect(released.status).toBe(200);
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id);

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('INVALID_STATE');
    expect(sms.sent).toHaveLength(0);
  });

  test('answers an unknown claim with 404', async () => {
    const nadia = await coordinator();

    const res = await dispatch(nadia, '0'.repeat(24));

    expect(res.status).toBe(404);
  });

  test('a repeat dispatch returns the first collection and sends no second text', async () => {
    const { claim } = await claimedOffer({ transportNeeded: true });
    const nadia = await coordinator();
    const first = await dispatch(nadia, claim._id);
    await settle();

    const repeat = await dispatch(
      nadia,
      claim._id,
      dispatchBody({ driverName: 'Someone Else', driverPhone: '+27823334444' }),
    );
    await settle();

    expect(repeat.status).toBe(200);
    expect(CollectionResponse.parse(repeat.body)).toEqual(CollectionResponse.parse(first.body));
    expect(await CollectionModel.countDocuments()).toBe(1);
    expect(sms.sent).toHaveLength(1);
  });

  test('two dispatches at once make one collection', async () => {
    const { claim } = await claimedOffer({ transportNeeded: true });
    const nadia = await coordinator();

    const [a, b] = await Promise.all([dispatch(nadia, claim._id), dispatch(nadia, claim._id)]);
    await settle();

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await CollectionModel.countDocuments()).toBe(1);
    expect(sms.sent).toHaveLength(1);
  });

  test('rejects a driver phone that is not E.164', async () => {
    const { claim } = await claimedOffer({ transportNeeded: true });
    const nadia = await coordinator();

    const res = await dispatch(nadia, claim._id, dispatchBody({ driverPhone: '0821112222' }));

    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('VALIDATION_FAILED');
  });

  test('is for coordinators only', async () => {
    const { claim, recipient } = await claimedOffer({ transportNeeded: true });

    const res = await dispatch(recipient, claim._id);

    expect(res.status).toBe(403);
    expect(await CollectionModel.countDocuments()).toBe(0);
  });
});

describe('closing a collection', () => {
  async function dispatched() {
    const { claim } = await claimedOffer({ transportNeeded: true });
    const nadia = await coordinator();
    const res = await dispatch(nadia, claim._id);
    return { nadia, id: CollectionResponse.parse(res.body).collection.id };
  }

  test('marks a dispatched collection completed and audits it', async () => {
    const { nadia, id } = await dispatched();

    const res = await update(nadia, id, 'completed');

    expect(res.status).toBe(200);
    expect(CollectionResponse.strict().parse(res.body).collection.status).toBe('completed');
    const audit = await AuditLogModel.find({ action: 'update_collection' });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.targetId.toString()).toBe(id);
  });

  test('cancels a dispatched collection', async () => {
    const { nadia, id } = await dispatched();

    const res = await update(nadia, id, 'cancelled');

    expect(res.status).toBe(200);
    expect(CollectionResponse.parse(res.body).collection.status).toBe('cancelled');
  });

  test('a closed collection stays closed', async () => {
    const { nadia, id } = await dispatched();
    await update(nadia, id, 'completed');

    const res = await update(nadia, id, 'cancelled');

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('INVALID_STATE');
    expect((await CollectionModel.findById(id))?.status).toBe('completed');
    expect(await AuditLogModel.countDocuments({ action: 'update_collection' })).toBe(1);
  });

  test('answers an unknown collection with 404', async () => {
    const nadia = await coordinator();

    const res = await update(nadia, '0'.repeat(24), 'completed');

    expect(res.status).toBe(404);
  });

  test('rejects a status other than completed or cancelled', async () => {
    const { nadia, id } = await dispatched();

    const res = await update(nadia, id, 'dispatched');

    expect(res.status).toBe(400);
  });
});

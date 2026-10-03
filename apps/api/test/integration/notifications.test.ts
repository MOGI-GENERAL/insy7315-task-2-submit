import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ErrorEnvelope,
  NotificationListResponse,
  PostOfferResponse,
  VapidKeyResponse,
  type Language,
  type Offer,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { NotificationModel, OfferModel, OrganisationModel, UserModel } from '../../src/db/index.js';
import { createLogger } from '../../src/logger.js';
import { channelSettings } from '../../src/notifications/channel-settings.js';
import { MemoryChannel } from '../../src/notifications/memory-channel.js';
import type {
  NotificationChannel,
  StoredPushSubscription,
} from '../../src/notifications/notification-channel.js';
import { TwilioSmsChannel, type TwilioMessages } from '../../src/notifications/twilio-channels.js';
import { LOCAL_PHOTO_BASE_URL, LocalPhotoStore } from '../../src/photos/local-photo-store.js';
import type { NotificationService } from '../../src/services/notification-service.js';
import type { TestClient } from '../test-client.js';
import {
  anonymousClient,
  createOrganisation,
  createUser,
  newNotificationService,
  newOfferService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

const VAPID_PUBLIC_KEY = 'fake-vapid-public-key';
/** the fake Twilio client refuses this number, as a trial account refuses an unverified one */
const UNVERIFIED_PHONE = '+27820000099';

/** stands in for the Twilio client, so the real SMS channel runs without a network */
class FakeTwilio implements TwilioMessages {
  created: { to: string; from: string; body: string }[] = [];

  async create(params: { to: string; from: string; body: string }) {
    if (params.to === UNVERIFIED_PHONE) {
      throw Object.assign(new Error('unverified number'), { code: 21608, status: 400 });
    }
    this.created.push(params);
    return { sid: `SM${String(this.created.length).padStart(32, '0')}`, status: 'queued' };
  }
}

const logLines: string[] = [];
const logger = createLogger({ write: (line: string) => void logLines.push(line) });

const push = new MemoryChannel('push');
const twilio = new FakeTwilio();
const sms = new TwilioSmsChannel(twilio, '+27820000000', logger);
const notifications = newNotificationService({
  channels: [push, sms],
  vapidPublicKey: VAPID_PUBLIC_KEY,
  logger,
});

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let photoDir = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  photoDir = await mkdtemp(join(tmpdir(), 'fedsa-notification-photos-'));
  const offers = newOfferService({
    photos: new LocalPhotoStore(photoDir),
    notifier: notifications,
  });
  const app = await startTestApp([], offers, notifications);
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
  if (photoDir) await rm(photoDir, { recursive: true, force: true });
});

beforeEach(async () => {
  logLines.length = 0;
  push.sent.length = 0;
  push.failing.clear();
  push.gone.clear();
  twilio.created.length = 0;
  await Promise.all([
    OrganisationModel.deleteMany({}),
    UserModel.deleteMany({}),
    OfferModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function pushSubscription(name: string): StoredPushSubscription {
  return {
    endpoint: `https://push.example.test/${name}`,
    keys: { p256dh: `fake-p256dh-${name}`, auth: `fake-auth-${name}` },
  };
}

async function member(
  organisationId: Types.ObjectId,
  role: 'donor' | 'recipient',
  options: {
    languagePreference?: Language;
    phone?: string;
    status?: 'active' | 'disabled';
    subscriptions?: StoredPushSubscription[];
  } = {},
) {
  const user = await createUser({ role, organisationId, ...options });
  if (options.subscriptions) {
    await UserModel.updateOne(
      { _id: user._id },
      { $set: { pushSubscriptions: options.subscriptions } },
    );
  }
  return user;
}

/** posts a bakery offer with a photo, so a test can check the photo never travels */
async function postOffer(client: TestClient): Promise<Offer> {
  const form = new FormData();
  form.append('title', '62 loaves and 40 rolls');
  form.append('category', 'bakery');
  form.append('offeredQuantityKg', '31');
  form.append('coldChain', 'ambient');
  form.append('collectionDeadline', new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString());
  form.append('photos', new Blob([new Uint8Array(PNG)], { type: 'image/png' }), 'bread.png');
  const res = await client.request('POST', '/api/offers', form);
  if (res.status !== 201) throw new Error(`posting failed with ${res.status}: ${await res.text()}`);
  return PostOfferResponse.parse(await res.json()).offer;
}

function rowsFor(userId: Types.ObjectId) {
  return NotificationModel.find({ userId }).sort({ channel: 1 }).lean().exec();
}

async function errorOf(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error;
}

describe('posting an offer', () => {
  test('reaches every active user of every eligible organisation, on the right channels', async () => {
    const donorOrganisation = await createOrganisation({ type: 'donor' });
    const donorUser = await member(donorOrganisation._id, 'donor');
    const shelter = await createOrganisation({ type: 'recipient', name: 'Siyakhula Shelter' });
    const kitchen = await createOrganisation({ type: 'recipient', name: "St Michael's Kitchen" });
    const pending = await createOrganisation({
      type: 'recipient',
      name: 'Not Yet Verified',
      status: 'pending',
    });

    const withPush = await member(shelter._id, 'recipient', {
      phone: '+27820000001',
      subscriptions: [pushSubscription('phone')],
    });
    const xhosa = await member(shelter._id, 'recipient', {
      phone: '+27820000002',
      languagePreference: 'xh',
    });
    const disabled = await member(shelter._id, 'recipient', { status: 'disabled' });
    const unverified = await member(kitchen._id, 'recipient', {
      phone: UNVERIFIED_PHONE,
      languagePreference: 'af',
    });
    const notEligible = await member(pending._id, 'recipient');

    const offer = await postOffer(await signedInClient(baseUrl, donorUser.email));
    await notifications.whenIdle();

    const offerId = new Types.ObjectId(offer.id);
    const href = `/recipient/offers/${offer.id}`;
    expect(await rowsFor(withPush._id)).toEqual([
      expect.objectContaining({
        channel: 'in_app',
        deliveryStatus: 'delivered',
        kind: 'offer_posted',
        offerId,
        organisationId: shelter._id,
        title: `New offer ${offer.reference}`,
        href,
        readAt: null,
      }),
      expect.objectContaining({
        channel: 'push',
        deliveryStatus: 'sent',
        to: pushSubscription('phone').endpoint,
        href,
      }),
      expect.objectContaining({
        channel: 'sms',
        deliveryStatus: 'queued',
        to: '+27820000001',
        providerMessageId: expect.stringMatching(/^SM/),
        body: expect.stringContaining(`Reply YES ${offer.reference} to claim`),
      }),
    ]);

    const xhosaRows = await rowsFor(xhosa._id);
    expect(xhosaRows.map((r) => r.channel)).toEqual(['in_app', 'sms']);
    expect(xhosaRows[0]!.title).toBe(`Isibonelelo esitsha ${offer.reference}`);

    const refused = await rowsFor(unverified._id);
    expect(refused.map((r) => [r.channel, r.deliveryStatus])).toEqual([
      ['in_app', 'delivered'],
      ['sms', 'failed'],
    ]);
    expect(refused[0]!.title).toBe(`Nuwe aanbod ${offer.reference}`);
    expect(refused[1]!.sentAt).toBeNull();

    expect(await rowsFor(disabled._id)).toEqual([]);
    expect(await rowsFor(notEligible._id)).toEqual([]);
    expect(await NotificationModel.countDocuments({ userId: donorUser._id })).toBe(0);
  });

  test('no message carries a photo', async () => {
    const donorOrganisation = await createOrganisation({ type: 'donor' });
    const donorUser = await member(donorOrganisation._id, 'donor');
    const shelter = await createOrganisation({ type: 'recipient' });
    await member(shelter._id, 'recipient', { subscriptions: [pushSubscription('a')] });

    const offer = await postOffer(await signedInClient(baseUrl, donorUser.email));
    await notifications.whenIdle();

    expect(offer.photos).toHaveLength(1);
    const sent = JSON.stringify([push.sent, twilio.created, await NotificationModel.find().lean()]);
    expect(sent).not.toContain(LOCAL_PHOTO_BASE_URL);
    expect(push.sent).toHaveLength(1);
    expect(twilio.created).toHaveLength(1);
  });

  test('logs how long the fan-out took from the moment of posting', async () => {
    const donorOrganisation = await createOrganisation({ type: 'donor' });
    const donorUser = await member(donorOrganisation._id, 'donor');
    const shelter = await createOrganisation({ type: 'recipient' });
    await member(shelter._id, 'recipient');

    const offer = await postOffer(await signedInClient(baseUrl, donorUser.email));
    await notifications.whenIdle();

    const summary = logLines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.msg === 'offer fan-out finished');
    expect(summary).toMatchObject({
      offerId: offer.id,
      organisations: 1,
      users: 1,
      rows: 2,
      failed: 0,
      durationMs: expect.any(Number),
    });
    expect(summary!.durationMs).toBeLessThan(60_000);
  });
});

describe('failures', () => {
  test('a channel that throws for everyone still leaves every other row written', async () => {
    const broken: NotificationChannel = {
      name: 'push',
      supports: () => true,
      send: async () => {
        throw new Error('push service unreachable');
      },
    };
    const memorySms = new MemoryChannel('sms');
    const service = newNotificationService({ channels: [broken, memorySms] });
    const shelter = await createOrganisation({ type: 'recipient' });
    const first = await member(shelter._id, 'recipient', {
      phone: '+27820000001',
      subscriptions: [pushSubscription('first')],
    });
    const second = await member(shelter._id, 'recipient', {
      phone: '+27820000002',
      subscriptions: [pushSubscription('second')],
    });
    memorySms.failing.add('+27820000001');

    const result = await service.notifyOrganisations([shelter._id.toString()], 'offer_posted', {
      reference: 'K4F2',
      quantityKg: 31,
      suburb: 'Woodstock',
      deadline: new Date().toISOString(),
    });

    expect(result).toEqual({ users: 2, rows: 6, failed: 3 });
    for (const [user, smsStatus] of [
      [first, 'failed'],
      [second, 'sent'],
    ] as const) {
      expect((await rowsFor(user._id)).map((r) => [r.channel, r.deliveryStatus])).toEqual([
        ['in_app', 'delivered'],
        ['push', 'failed'],
        ['sms', smsStatus],
      ]);
    }
  });

  test('a subscription the push service reports gone is removed from the user', async () => {
    const shelter = await createOrganisation({ type: 'recipient' });
    const user = await member(shelter._id, 'recipient', {
      subscriptions: [pushSubscription('old-laptop'), pushSubscription('phone')],
    });
    push.gone.add(pushSubscription('old-laptop').endpoint);

    await notifications.notifyUsers([user._id.toString()], 'verification', {
      organisationName: 'Siyakhula Shelter',
    });

    const stored = await UserModel.findById(user._id).lean();
    expect(stored!.pushSubscriptions.map((s) => s.endpoint)).toEqual([
      pushSubscription('phone').endpoint,
    ]);
    const pushRows = await NotificationModel.find({ userId: user._id, channel: 'push' }).lean();
    expect(pushRows.map((r) => [r.to, r.deliveryStatus])).toEqual(
      expect.arrayContaining([
        [pushSubscription('old-laptop').endpoint, 'failed'],
        [pushSubscription('phone').endpoint, 'sent'],
      ]),
    );
  });
});

describe('notifying from other work', () => {
  test('a donor hears that their offer was claimed, in their language, linked to the offer', async () => {
    const bakery = await createOrganisation({ type: 'donor' });
    const donorUser = await member(bakery._id, 'donor', {
      phone: '+27820000003',
      languagePreference: 'af',
    });
    const offerId = new Types.ObjectId().toString();

    await notifications.notifyOrganisations(
      [bakery._id.toString()],
      'offer_claimed',
      {
        reference: 'K4F2',
        quantityKg: 31,
        suburb: 'Woodstock',
        deadline: new Date().toISOString(),
        claimedBy: 'Siyakhula Shelter',
      },
      offerId,
    );

    const rows = await rowsFor(donorUser._id);
    expect(rows.map((r) => r.channel)).toEqual(['in_app', 'sms']);
    expect(rows[0]).toMatchObject({
      kind: 'offer_claimed',
      title: 'Aanbod K4F2 geëis',
      href: `/donor/offers/${offerId}`,
    });
  });

  test('a driver with no account gets one SMS, logged against the phone number alone', async () => {
    const offerId = new Types.ObjectId().toString();
    const status = await notifications.sendSms(
      '+27820000004',
      'driver_dispatched',
      {
        reference: 'K4F2',
        pickupAddress: '12 Long Street, Woodstock',
        contactName: 'Riaan de Villiers',
        contactPhone: '+27820000005',
        deadline: new Date().toISOString(),
        dropOffAddress: '4 Lansdowne Road, Khayelitsha',
      },
      offerId,
    );

    expect(status).toBe('queued');
    expect(twilio.created).toEqual([
      expect.objectContaining({
        to: '+27820000004',
        body: expect.stringContaining('12 Long Street, Woodstock'),
      }),
    ]);
    const rows = await NotificationModel.find().lean();
    expect(rows).toEqual([
      expect.objectContaining({
        userId: null,
        organisationId: null,
        to: '+27820000004',
        channel: 'sms',
        kind: 'driver_dispatched',
        deliveryStatus: 'queued',
        offerId: new Types.ObjectId(offerId),
      }),
    ]);
  });

  test('with SMS off, a driver message is recorded as failed', async () => {
    const service = newNotificationService();

    const status = await service.sendSms('+27820000004', 'driver_dispatched', {
      reference: 'K4F2',
      pickupAddress: '12 Long Street',
      contactName: 'Riaan',
      contactPhone: '+27820000005',
      deadline: new Date().toISOString(),
      dropOffAddress: '4 Lansdowne Road',
    });

    expect(status).toBe('failed');
    expect(await NotificationModel.find().lean()).toEqual([
      expect.objectContaining({ channel: 'sms', deliveryStatus: 'failed', sentAt: null }),
    ]);
  });
});

describe('the inbox', () => {
  async function inboxOwners() {
    const shelter = await createOrganisation({ type: 'recipient' });
    const owner = await member(shelter._id, 'recipient');
    const other = await member(shelter._id, 'recipient');
    for (const name of ['First', 'Second']) {
      await notifications.notifyUsers([owner._id.toString()], 'verification', {
        organisationName: name,
      });
    }
    // mirrored to SMS as well, which must not show twice
    await notifications.notifyUsers([owner._id.toString()], 'offer_claimed', {
      reference: 'K4F2',
      quantityKg: 31,
      suburb: 'Woodstock',
      deadline: new Date().toISOString(),
    });
    await notifications.notifyUsers([other._id.toString()], 'verification', {
      organisationName: 'Not yours',
    });
    return { owner, other };
  }

  async function inbox(client: TestClient) {
    const res = await client.get('/api/notifications');
    expect(res.status).toBe(200);
    return NotificationListResponse.parse(await res.json());
  }

  test('lists only the in-app notifications of the caller, newest first', async () => {
    const { owner } = await inboxOwners();
    const client = await signedInClient(baseUrl, owner.email);

    const body = await inbox(client);

    expect(body.unread).toBe(3);
    expect(body.items.map((n) => n.kind)).toEqual([
      'offer_claimed',
      'verification',
      'verification',
    ]);
    expect(body.items.every((n) => n.channel === 'in_app')).toBe(true);
    expect(JSON.stringify(body)).not.toContain('Not yours');
    expect(await NotificationModel.countDocuments({ userId: owner._id, channel: 'sms' })).toBe(1);
  });

  test('marking one as read lowers the unread count and keeps the first read time', async () => {
    const { owner } = await inboxOwners();
    const client = await signedInClient(baseUrl, owner.email);
    const [newest] = (await inbox(client)).items;

    expect((await client.post(`/api/notifications/${newest!.id}/read`)).status).toBe(204);
    const once = await inbox(client);
    expect(once.unread).toBe(2);
    const readAt = once.items.find((n) => n.id === newest!.id)!.readAt;
    expect(readAt).not.toBeNull();

    expect((await client.post(`/api/notifications/${newest!.id}/read`)).status).toBe(204);
    const twice = await inbox(client);
    expect(twice.unread).toBe(2);
    expect(twice.items.find((n) => n.id === newest!.id)!.readAt).toBe(readAt);
  });

  test('a notification of another user looks missing', async () => {
    const { owner, other } = await inboxOwners();
    const theirs = await NotificationModel.findOne({ userId: other._id }).lean();
    const client = await signedInClient(baseUrl, owner.email);

    const res = await client.post(`/api/notifications/${theirs!._id.toString()}/read`);

    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NOT_FOUND');
    expect((await NotificationModel.findById(theirs!._id).lean())!.readAt).toBeNull();
  });

  test('an SMS copy cannot be marked as read through the inbox', async () => {
    const { owner } = await inboxOwners();
    const smsCopy = await NotificationModel.findOne({ userId: owner._id, channel: 'sms' }).lean();
    const client = await signedInClient(baseUrl, owner.email);

    expect((await client.post(`/api/notifications/${smsCopy!._id.toString()}/read`)).status).toBe(
      404,
    );
  });

  test('a malformed id is a validation error', async () => {
    const { owner } = await inboxOwners();
    const client = await signedInClient(baseUrl, owner.email);

    const res = await client.post('/api/notifications/not-an-id/read');

    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('VALIDATION_FAILED');
  });

  test('needs a signed-in user', async () => {
    const client = await anonymousClient(baseUrl);
    expect((await client.get('/api/notifications')).status).toBe(401);
    const id = new Types.ObjectId().toString();
    expect((await client.post(`/api/notifications/${id}/read`)).status).toBe(401);
  });
});

describe('push subscriptions', () => {
  const subscription = {
    endpoint: 'https://push.example.test/shared-phone',
    expirationTime: null,
    keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
  };

  async function signedInRecipient() {
    const shelter = await createOrganisation({ type: 'recipient' });
    const user = await member(shelter._id, 'recipient');
    return { user, client: await signedInClient(baseUrl, user.email) };
  }

  async function endpointsOf(userId: Types.ObjectId) {
    const user = await UserModel.findById(userId).lean();
    return user!.pushSubscriptions.map((s) => s.endpoint);
  }

  test('subscribing stores the subscription once, however often it is sent', async () => {
    const { user, client } = await signedInRecipient();

    expect((await client.post('/api/me/push-subscriptions', subscription)).status).toBe(201);
    expect((await client.post('/api/me/push-subscriptions', subscription)).status).toBe(201);

    expect(await endpointsOf(user._id)).toEqual([subscription.endpoint]);
  });

  test('a shared phone belongs to whoever subscribed on it last', async () => {
    const first = await signedInRecipient();
    const second = await signedInRecipient();

    await first.client.post('/api/me/push-subscriptions', subscription);
    await second.client.post('/api/me/push-subscriptions', subscription);

    expect(await endpointsOf(first.user._id)).toEqual([]);
    expect(await endpointsOf(second.user._id)).toEqual([subscription.endpoint]);
  });

  test('unsubscribing removes the subscription, and a repeat still succeeds', async () => {
    const { user, client } = await signedInRecipient();
    await client.post('/api/me/push-subscriptions', subscription);

    const res = await client.request('DELETE', '/api/me/push-subscriptions', {
      endpoint: subscription.endpoint,
    });

    expect(res.status).toBe(204);
    expect(await endpointsOf(user._id)).toEqual([]);
    const again = await client.request('DELETE', '/api/me/push-subscriptions', {
      endpoint: subscription.endpoint,
    });
    expect(again.status).toBe(204);
  });

  test('a subscription without keys is a validation error', async () => {
    const { client } = await signedInRecipient();

    const res = await client.post('/api/me/push-subscriptions', {
      endpoint: subscription.endpoint,
    });

    expect(res.status).toBe(400);
    expect((await errorOf(res)).fields).toHaveProperty('keys');
  });

  test('needs a signed-in user', async () => {
    const client = await anonymousClient(baseUrl);
    expect((await client.post('/api/me/push-subscriptions', subscription)).status).toBe(401);
  });

  test('anyone can read the public key', async () => {
    const client = await anonymousClient(baseUrl);

    const res = await client.get('/api/push/public-key');

    expect(res.status).toBe(200);
    expect(VapidKeyResponse.parse(await res.json())).toEqual({ vapidPublicKey: VAPID_PUBLIC_KEY });
  });
});

describe('with no channel settings at all', () => {
  let bare: { baseUrl: string; close: () => Promise<void> };
  let service: NotificationService;

  beforeAll(async () => {
    service = newNotificationService({
      ...channelSettings({}, createLogger({ write: () => {} })),
    });
    bare = await startTestApp([], newOfferService({ notifier: service }), service);
  });

  afterAll(async () => {
    await bare.close();
  });

  test('the API starts, serves requests and says push is off', async () => {
    const client = await anonymousClient(bare.baseUrl);

    expect((await client.get('/api/health')).status).toBe(200);
    const res = await client.get('/api/push/public-key');
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('NOT_FOUND');
  });

  test('a posted offer still reaches the inbox', async () => {
    const donorOrganisation = await createOrganisation({ type: 'donor' });
    const donorUser = await member(donorOrganisation._id, 'donor');
    const shelter = await createOrganisation({ type: 'recipient' });
    const recipient = await member(shelter._id, 'recipient', {
      subscriptions: [pushSubscription('a')],
    });

    const client = await signedInClient(bare.baseUrl, donorUser.email);
    const offer = await postOffer(client);
    await service.whenIdle();

    expect((await rowsFor(recipient._id)).map((r) => [r.channel, r.title])).toEqual([
      ['in_app', `New offer ${offer.reference}`],
    ]);
  });
});

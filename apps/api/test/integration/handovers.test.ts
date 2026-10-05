import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DonorConfirmResponse,
  ErrorEnvelope,
  HandoverListResponse,
  HandoverResponse,
  RecipientConfirmResponse,
  type OfferStatus,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  HandoverRecordModel,
  OfferModel,
  OrganisationModel,
} from '../../src/db/index.js';
import { LocalPhotoStore } from '../../src/photos/local-photo-store.js';
import type { NotificationService } from '../../src/services/notification-service.js';
import type { TestClient } from '../test-client.js';
import {
  createOrganisation,
  createUser,
  newClaimService,
  newHandoverService,
  newNotificationService,
  newOfferService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

/** the smallest file that passes the JPEG magic-byte check */
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

type NotifyCall = Parameters<NotificationService['notifyOrganisations']>;

const notifyCalls: NotifyCall[] = [];
const notifier = {
  async notifyOrganisations(...args: NotifyCall) {
    notifyCalls.push(args);
    return { users: 0, rows: 0, failed: 0 };
  },
} as Pick<NotificationService, 'notifyOrganisations'>;

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let photoDir = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  photoDir = await mkdtemp(join(tmpdir(), 'fedsa-handover-photos-'));
  const photos = new LocalPhotoStore(photoDir);
  const notifications = newNotificationService();
  const offers = newOfferService({ photos, notifier: notifications });
  const app = await startTestApp(
    [],
    offers,
    notifications,
    newClaimService(offers),
    undefined,
    newHandoverService(offers, { photos, notifications: notifier }),
  );
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
  if (photoDir) await rm(photoDir, { recursive: true, force: true });
});

beforeEach(async () => {
  notifyCalls.length = 0;
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    HandoverRecordModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);
});

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

let referenceCount = 0;

/** a claimed offer: a donor, a recipient and the recipient's active claim */
async function claimedOffer(
  fields: { kg?: number; deadline?: Date; recipientStatus?: 'verified' | 'active' } = {},
) {
  const donor = await createOrganisation({ type: 'donor' });
  const donorUser = await createUser({ role: 'donor', organisationId: donor._id });
  referenceCount += 1;
  const offer = await OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: donorUser._id,
    reference: `H${referenceCount.toString().padStart(3, '0')}`,
    title: '62 loaves and 40 rolls',
    description: null,
    category: 'bakery',
    offeredQuantityKg: fields.kg ?? 31,
    coldChain: 'ambient',
    photoUrls: [],
    availableFrom: inHours(-1),
    collectionDeadline: fields.deadline ?? inHours(3),
    status: 'open' satisfies OfferStatus,
  });
  const recipientOrg = await createOrganisation({
    type: 'recipient',
    status: fields.recipientStatus ?? 'verified',
  });
  const recipientUser = await createUser({ role: 'recipient', organisationId: recipientOrg._id });
  const recipient = await signedInClient(baseUrl, recipientUser.email);
  const claimed = await recipient.post(`/api/offers/${offer._id.toString()}/claim`, {
    transportNeeded: false,
  });
  expect(claimed.status).toBe(201);
  const donorClient = await signedInClient(baseUrl, donorUser.email);
  return { donor, offer, recipientOrg, recipient, donorClient };
}

function donorForm(kg: number, photo: Buffer | null = JPEG) {
  const form = new FormData();
  form.append('collectedQuantityKg', String(kg));
  if (photo)
    form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'a.jpg');
  return form;
}

async function read(pending: Promise<Response>) {
  const res = await pending;
  const text = await res.text();
  const isJson = res.headers.get('content-type')?.includes('json');
  return {
    status: res.status,
    headers: res.headers,
    body: isJson ? (JSON.parse(text) as unknown) : null,
  };
}

const donorConfirm = (client: TestClient, offerId: unknown, kg: number, photo?: Buffer | null) =>
  read(client.post(`/api/offers/${String(offerId)}/handover/donor-confirm`, donorForm(kg, photo)));

const recipientConfirm = (
  client: TestClient,
  offerId: unknown,
  body: object = { conditionOnReceipt: 'good' },
) => read(client.post(`/api/offers/${String(offerId)}/handover/recipient-confirm`, body));

async function coordinator() {
  const user = await createUser({ role: 'coordinator' });
  return signedInClient(baseUrl, user.email);
}

/** background notifications start after the reply */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

function errorCode(body: unknown) {
  return ErrorEnvelope.parse(body).error.code;
}

describe('the donor confirms what left', () => {
  test('creates the handover with a photo and a 24 month retention, and leaves the offer claimed', async () => {
    const { offer, donorClient } = await claimedOffer();

    const res = await donorConfirm(donorClient, offer._id, 31);

    expect(res.status).toBe(201);
    const body = DonorConfirmResponse.strict().parse(res.body);
    expect(body.remainderOffer).toBeNull();
    expect(body.handover).toMatchObject({
      offerId: offer._id.toString(),
      collectedQuantityKg: 31,
      recipientConfirmedAt: null,
      conditionOnReceipt: null,
    });
    expect(body.handover.donorPhotoThumbUrl).toContain('/thumb/');

    const stored = (await HandoverRecordModel.findById(body.handover.id))!;
    expect(stored.donorPhotoUrl).toMatch(/^https:\/\/local-photos\.invalid\//);
    const months =
      (stored.retainUntil.getUTCFullYear() - stored.donorConfirmedAt.getUTCFullYear()) * 12 +
      stored.retainUntil.getUTCMonth() -
      stored.donorConfirmedAt.getUTCMonth();
    expect(months).toBe(24);
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
  });

  test('works without a photo', async () => {
    const { offer, donorClient } = await claimedOffer();

    const res = await donorConfirm(donorClient, offer._id, 31, null);

    expect(res.status).toBe(201);
    expect(DonorConfirmResponse.parse(res.body).handover.donorPhotoThumbUrl).toBeNull();
  });

  test('a retry returns the same handover and makes no second one', async () => {
    const { offer, donorClient } = await claimedOffer();

    const first = await donorConfirm(donorClient, offer._id, 31);
    const again = await donorConfirm(donorClient, offer._id, 31);

    expect(again.status).toBe(200);
    expect(DonorConfirmResponse.parse(again.body).handover.id).toBe(
      DonorConfirmResponse.parse(first.body).handover.id,
    );
    expect(await HandoverRecordModel.countDocuments()).toBe(1);
  });

  test('two requests at once make one handover', async () => {
    const { offer, donorClient } = await claimedOffer();

    const results = await Promise.all([
      donorConfirm(donorClient, offer._id, 31),
      donorConfirm(donorClient, offer._id, 31),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await HandoverRecordModel.countDocuments()).toBe(1);
  });

  test('an offer nobody has claimed gets INVALID_STATE', async () => {
    const { offer, donorClient } = await claimedOffer();
    await OfferModel.updateOne({ _id: offer._id }, { status: 'open' });
    await ClaimModel.updateMany({ offerId: offer._id }, { status: 'released' });

    const res = await donorConfirm(donorClient, offer._id, 31);

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('INVALID_STATE');
  });

  test('more than was offered is refused', async () => {
    const { offer, donorClient } = await claimedOffer({ kg: 31 });

    const res = await donorConfirm(donorClient, offer._id, 40);

    expect(res.status).toBe(400);
    expect(await HandoverRecordModel.countDocuments()).toBe(0);
  });

  test('a file that is not an image is rejected', async () => {
    const { offer, donorClient } = await claimedOffer();

    const res = await donorConfirm(donorClient, offer._id, 31, Buffer.from('not a photo'));

    expect(res.status).toBe(422);
    expect(await HandoverRecordModel.countDocuments()).toBe(0);
  });

  test("another donor's offer looks missing, and a recipient cannot confirm for the donor", async () => {
    const { offer, recipient } = await claimedOffer();
    const other = await createOrganisation({ type: 'donor', name: 'Other Bakery' });
    const otherUser = await createUser({ role: 'donor', organisationId: other._id });
    const otherClient = await signedInClient(baseUrl, otherUser.email);

    expect((await donorConfirm(otherClient, offer._id, 31)).status).toBe(404);
    expect((await donorConfirm(recipient, offer._id, 31)).status).toBe(403);
  });
});

describe('the recipient confirms what arrived', () => {
  test('completes the handover in one step and notifies both organisations', async () => {
    const { donor, offer, recipientOrg, recipient, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 29.5);

    const res = await recipientConfirm(recipient, offer._id, { conditionOnReceipt: 'acceptable' });

    expect(res.status).toBe(200);
    const body = RecipientConfirmResponse.strict().parse(res.body);
    expect(body.offer.status).toBe('collected');
    expect(body.handover).toMatchObject({
      collectedQuantityKg: 29.5,
      conditionOnReceipt: 'acceptable',
    });
    expect(body.handover.recipientConfirmedAt).not.toBeNull();
    expect((await ClaimModel.findOne({ offerId: offer._id }))?.status).toBe('fulfilled');

    await settle();
    expect(notifyCalls).toHaveLength(1);
    const [ids, kind, data, offerId] = notifyCalls[0]!;
    expect([...ids].sort()).toEqual([donor._id.toString(), recipientOrg._id.toString()].sort());
    expect(kind).toBe('handover_confirmed');
    expect(data).toEqual({ reference: offer.reference, quantityKg: 29.5 });
    expect(offerId).toBe(offer._id.toString());
  });

  test('before the donor has confirmed, gets INVALID_STATE', async () => {
    const { offer, recipient } = await claimedOffer();

    const res = await recipientConfirm(recipient, offer._id);

    expect(res.status).toBe(409);
    expect(errorCode(res.body)).toBe('INVALID_STATE');
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
  });

  test('a retry returns the same result and notifies once', async () => {
    const { offer, recipient, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 31);

    const first = await recipientConfirm(recipient, offer._id);
    const again = await recipientConfirm(recipient, offer._id, {
      conditionOnReceipt: 'problem',
      conditionNotes: 'a later change of mind',
    });

    expect(again.status).toBe(200);
    expect(RecipientConfirmResponse.parse(again.body)).toEqual(
      RecipientConfirmResponse.parse(first.body),
    );
    await settle();
    expect(notifyCalls).toHaveLength(1);
  });

  test('a problem needs a note', async () => {
    const { offer, recipient, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 31);

    const res = await recipientConfirm(recipient, offer._id, { conditionOnReceipt: 'problem' });

    expect(res.status).toBe(400);
  });

  test("another recipient's claim looks missing", async () => {
    const { offer, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 31);
    const other = await createOrganisation({ type: 'recipient', name: 'Other Shelter' });
    const otherUser = await createUser({ role: 'recipient', organisationId: other._id });
    const otherClient = await signedInClient(baseUrl, otherUser.email);

    expect((await recipientConfirm(otherClient, offer._id)).status).toBe(404);
  });

  test('a verified organisation becomes active on its first fulfilment, and not before', async () => {
    const { offer, recipientOrg, recipient, donorClient } = await claimedOffer();
    const status = async () => (await OrganisationModel.findById(recipientOrg._id))?.status;

    await donorConfirm(donorClient, offer._id, 31);
    expect(await status()).toBe('verified');

    await recipientConfirm(recipient, offer._id);
    expect(await status()).toBe('active');
  });

  test('an active organisation stays active', async () => {
    const { offer, recipientOrg, recipient, donorClient } = await claimedOffer({
      recipientStatus: 'active',
    });
    await donorConfirm(donorClient, offer._id, 31);

    await recipientConfirm(recipient, offer._id);

    expect((await OrganisationModel.findById(recipientOrg._id))?.status).toBe('active');
  });

  test('once the donor has confirmed, the claim can no longer be released', async () => {
    const { offer, recipient, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 31);
    const claim = (await ClaimModel.findOne({ offerId: offer._id }))!;

    const res = await read(recipient.post(`/api/claims/${claim._id.toString()}/release`, {}));

    expect(res.status).toBe(409);
  });
});

describe('the remainder split', () => {
  test('a short collection offers the rest until the original deadline', async () => {
    const deadline = inHours(3);
    const { offer, donorClient } = await claimedOffer({ kg: 31, deadline });

    const res = await donorConfirm(donorClient, offer._id, 20);

    expect(res.status).toBe(201);
    const { remainderOffer } = DonorConfirmResponse.strict().parse(res.body);
    expect(remainderOffer).toMatchObject({
      offeredQuantityKg: 11,
      parentOfferId: offer._id.toString(),
      status: 'open',
      title: offer.title,
      category: 'bakery',
      collectionDeadline: deadline.toISOString(),
    });
    expect(remainderOffer!.reference).not.toBe(offer.reference);
  });

  test('a retry returns the same remainder and makes no second one', async () => {
    const { offer, donorClient } = await claimedOffer({ kg: 31 });

    const first = DonorConfirmResponse.parse((await donorConfirm(donorClient, offer._id, 20)).body);
    const again = DonorConfirmResponse.parse((await donorConfirm(donorClient, offer._id, 20)).body);

    expect(again.remainderOffer?.id).toBe(first.remainderOffer?.id);
    expect(await OfferModel.countDocuments({ parentOfferId: offer._id })).toBe(1);
  });

  test('the full quantity makes no remainder', async () => {
    const { offer, donorClient } = await claimedOffer({ kg: 31 });

    const res = await donorConfirm(donorClient, offer._id, 31);

    expect(DonorConfirmResponse.parse(res.body).remainderOffer).toBeNull();
    expect(await OfferModel.countDocuments({ parentOfferId: offer._id })).toBe(0);
  });
});

describe('disputes', () => {
  async function problemHandover() {
    const setup = await claimedOffer();
    await donorConfirm(setup.donorClient, setup.offer._id, 31);
    await recipientConfirm(setup.recipient, setup.offer._id, {
      conditionOnReceipt: 'problem',
      conditionNotes: 'Only four trays arrived',
    });
    const handover = (await HandoverRecordModel.findOne({ offerId: setup.offer._id }))!;
    return { ...setup, handover };
  }

  test('a coordinator lists problems still open, and resolved ones separately', async () => {
    const { handover } = await problemHandover();
    const staff = await coordinator();

    const open = HandoverListResponse.strict().parse(
      (await read(staff.get('/api/handovers?condition=problem&resolved=false'))).body,
    );
    expect(open.items.map((i) => i.id)).toEqual([handover._id.toString()]);
    expect(open.items[0]!.recipient.name).toBeTruthy();
    expect(open.items[0]!.offer.id).toBe(handover.offerId.toString());

    const resolved = HandoverListResponse.parse(
      (await read(staff.get('/api/handovers?resolved=true'))).body,
    );
    expect(resolved.items).toEqual([]);
  });

  test('a handover the recipient has not confirmed is not listed', async () => {
    const { offer, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 31);
    const staff = await coordinator();

    const res = HandoverListResponse.parse((await read(staff.get('/api/handovers'))).body);

    expect(res.items).toEqual([]);
  });

  test('a resolution is written once and audited', async () => {
    const { handover } = await problemHandover();
    const staff = await coordinator();
    const path = `/api/handovers/${handover._id.toString()}/resolution`;

    const first = await read(staff.post(path, { resolutionNote: 'Donor agreed to a credit' }));

    expect(first.status).toBe(200);
    expect(HandoverResponse.strict().parse(first.body).handover).toMatchObject({
      resolutionNote: 'Donor agreed to a credit',
    });
    expect(await AuditLogModel.countDocuments({ action: 'resolve_dispute' })).toBe(1);

    const second = await read(staff.post(path, { resolutionNote: 'A different outcome' }));
    expect(second.status).toBe(409);
    expect(errorCode(second.body)).toBe('INVALID_STATE');
    const stored = (await HandoverRecordModel.findById(handover._id))!;
    expect(stored.resolutionNote).toBe('Donor agreed to a credit');
    expect(await AuditLogModel.countDocuments({ action: 'resolve_dispute' })).toBe(1);
  });

  test('only a problem handover can be resolved', async () => {
    const { offer, recipient, donorClient } = await claimedOffer();
    await donorConfirm(donorClient, offer._id, 31);
    await recipientConfirm(recipient, offer._id);
    const handover = (await HandoverRecordModel.findOne({ offerId: offer._id }))!;
    const staff = await coordinator();

    const res = await read(
      staff.post(`/api/handovers/${handover._id.toString()}/resolution`, { resolutionNote: 'x' }),
    );

    expect(res.status).toBe(409);
  });

  test('a donor cannot resolve or list', async () => {
    const { handover, donorClient } = await problemHandover();

    expect((await read(donorClient.get('/api/handovers'))).status).toBe(403);
    const res = await read(
      donorClient.post(`/api/handovers/${handover._id.toString()}/resolution`, {
        resolutionNote: 'x',
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe('the handover photo', () => {
  async function withPhoto() {
    const setup = await claimedOffer();
    const res = await donorConfirm(setup.donorClient, setup.offer._id, 31);
    const { handover } = DonorConfirmResponse.parse(res.body);
    return { ...setup, id: handover.id, path: `/api/handovers/${handover.id}/photo` };
  }

  const redirect = (client: TestClient, path: string) => read(client.get(path));

  test('sends both parties and staff to the full-size image', async () => {
    const { donorClient, recipient, path, id } = await withPhoto();
    const stored = (await HandoverRecordModel.findById(id))!;
    const staff = await coordinator();
    const admin = await createUser({ role: 'administrator' });
    const adminClient = await signedInClient(baseUrl, admin.email);

    for (const client of [donorClient, recipient, staff, adminClient]) {
      const res = await redirect(client, path);
      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(stored.donorPhotoUrl);
    }
  });

  test("another organisation's user gets 404", async () => {
    const { path } = await withPhoto();
    const other = await createOrganisation({ type: 'donor', name: 'Other Bakery' });
    const otherUser = await createUser({ role: 'donor', organisationId: other._id });
    const otherClient = await signedInClient(baseUrl, otherUser.email);

    expect((await redirect(otherClient, path)).status).toBe(404);
  });

  test('404 once the photo is gone', async () => {
    const { donorClient, id, path } = await withPhoto();
    await HandoverRecordModel.updateOne({ _id: id }, { donorPhotoUrl: null });

    expect((await redirect(donorClient, path)).status).toBe(404);
  });

  test('404 for an unknown handover', async () => {
    const staff = await coordinator();

    expect(
      (await redirect(staff, `/api/handovers/${new Types.ObjectId().toString()}/photo`)).status,
    ).toBe(404);
  });
});

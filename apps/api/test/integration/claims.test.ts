import {
  ClaimListResponse,
  ClaimResponse,
  ClaimWithOfferResponse,
  ErrorEnvelope,
  type Claim,
  type Offer,
  type OfferStatus,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  ClaimModel,
  HandoverRecordModel,
  OfferModel,
  OrganisationModel,
} from '../../src/db/index.js';
import type { ClaimNotifier } from '../../src/services/claim-notifier.js';
import type { OfferNotifier } from '../../src/services/offer-notifier.js';
import type { TestClient } from '../test-client.js';
import {
  createOrganisation,
  createUser,
  newClaimService,
  newOfferService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

class RecordingOfferNotifier implements OfferNotifier {
  calls: { offer: Offer; recipientOrganisationIds: string[] }[] = [];
  async notifyEligible(offer: Offer, recipientOrganisationIds: string[]) {
    this.calls.push({ offer, recipientOrganisationIds });
  }
}

class RecordingClaimNotifier implements ClaimNotifier {
  calls: { offer: Offer; claim: Claim }[] = [];
  async notifyClaimed(offer: Offer, claim: Claim) {
    this.calls.push({ offer, claim });
  }
}

const offerNotifier = new RecordingOfferNotifier();
const claimNotifier = new RecordingClaimNotifier();
let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const offers = newOfferService({ notifier: offerNotifier });
  const app = await startTestApp(
    [],
    offers,
    newClaimService(offers, { offerNotifier, claimNotifier }),
  );
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

beforeEach(async () => {
  offerNotifier.calls = [];
  claimNotifier.calls = [];
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    HandoverRecordModel.deleteMany({}),
  ]);
});

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

let referenceCount = 0;

async function createDonorOffer(
  fields: {
    status?: OfferStatus;
    availableFrom?: Date;
    collectionDeadline?: Date;
    coldChain?: 'ambient' | 'refrigerated' | 'frozen';
  } = {},
) {
  const donor = await createOrganisation({ type: 'donor' });
  referenceCount += 1;
  const offer = await OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: new Types.ObjectId(),
    reference: `T${referenceCount.toString().padStart(3, '0')}`,
    title: '62 loaves and 40 rolls',
    description: null,
    category: 'bakery',
    offeredQuantityKg: 31,
    coldChain: fields.coldChain ?? 'ambient',
    photoUrls: [],
    availableFrom: fields.availableFrom ?? inHours(-1),
    collectionDeadline: fields.collectionDeadline ?? inHours(3),
    status: fields.status ?? 'open',
  });
  return { donor, offer };
}

/** a signed-in user of a verified recipient in the donor's suburb */
async function recipient(
  fields: { status?: 'pending' | 'verified' | 'active'; storageRefrigerated?: boolean } = {},
) {
  const organisation = await createOrganisation({
    type: 'recipient',
    status: fields.status,
    storageRefrigerated: fields.storageRefrigerated,
  });
  const user = await createUser({ role: 'recipient', organisationId: organisation._id });
  return { organisation, client: await signedInClient(baseUrl, user.email) };
}

async function staff(role: 'coordinator' | 'donor') {
  const user = await createUser({ role });
  return signedInClient(baseUrl, user.email);
}

async function read(pending: Promise<Response>) {
  const res = await pending;
  return { status: res.status, body: (await res.json()) as unknown };
}

const claim = (client: TestClient, offerId: unknown, transportNeeded = false) =>
  read(client.post(`/api/offers/${String(offerId)}/claim`, { transportNeeded }));

const release = (client: TestClient, claimId: string, reason?: string) =>
  read(client.post(`/api/claims/${claimId}/release`, reason ? { reason } : {}));

const listClaims = (client: TestClient, query = '') =>
  read(client.get(`/api/claims${query}`)).then((res) => ClaimListResponse.parse(res.body));

/** background notifications start after the reply */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('claiming an offer', () => {
  test('locks the offer to the organisation and returns the donor contact', async () => {
    const { donor, offer } = await createDonorOffer();
    const { organisation, client } = await recipient();

    const res = await claim(client, offer._id, true);

    expect(res.status).toBe(201);
    const body = ClaimResponse.strict().parse(res.body);
    expect(body.claim).toMatchObject({
      offerId: offer._id.toString(),
      recipientOrganisationId: organisation._id.toString(),
      transportNeeded: true,
      status: 'active',
    });
    expect(body.donorContact).toEqual({
      name: donor.contactName,
      phone: donor.contactPhone,
      addressLine: donor.addressLine,
      suburb: donor.suburb,
    });
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
    await settle();
    expect(claimNotifier.calls).toHaveLength(1);
    expect(claimNotifier.calls[0]!.claim.id).toBe(body.claim.id);
  });

  test('20 organisations claiming at once: exactly one wins, the rest get OFFER_UNAVAILABLE', async () => {
    const { offer } = await createDonorOffer();
    const claimants = await Promise.all(Array.from({ length: 20 }, () => recipient()));

    const responses = await Promise.all(claimants.map(({ client }) => claim(client, offer._id)));

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(19);
    for (const res of responses.filter((r) => r.status === 409)) {
      expect(ErrorEnvelope.parse(res.body).error.code).toBe('OFFER_UNAVAILABLE');
    }
    expect(await ClaimModel.countDocuments({ offerId: offer._id })).toBe(1);
    expect(await ClaimModel.countDocuments({ offerId: offer._id, status: 'active' })).toBe(1);
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
  });

  test('the same organisation claiming twice at once gets one claim, answered 201 then 200', async () => {
    const { offer } = await createDonorOffer();
    const { client } = await recipient();

    const responses = await Promise.all([claim(client, offer._id), claim(client, offer._id)]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    const [first, second] = responses.map((r) => ClaimResponse.parse(r.body));
    expect(first!.claim.id).toBe(second!.claim.id);
    expect(await ClaimModel.countDocuments({ offerId: offer._id })).toBe(1);
  });

  test('a retry after the first claim succeeded returns the same claim with 200', async () => {
    const { offer } = await createDonorOffer();
    const { client } = await recipient();

    const first = await claim(client, offer._id);
    const retry = await claim(client, offer._id);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(ClaimResponse.parse(retry.body).claim.id).toBe(ClaimResponse.parse(first.body).claim.id);
    await settle();
    expect(claimNotifier.calls).toHaveLength(1);
  });

  test.each([
    ['scheduled for later', { availableFrom: inHours(2), collectionDeadline: inHours(5) }],
    ['past its deadline', { availableFrom: inHours(-3), collectionDeadline: inHours(-1) }],
    ['cancelled', { status: 'cancelled' as const }],
    ['expired', { status: 'expired' as const }],
  ])('an offer %s cannot be claimed', async (_label, fields) => {
    const { offer } = await createDonorOffer(fields);
    const { client } = await recipient();

    const res = await claim(client, offer._id);

    expect(res.status).toBe(409);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('OFFER_UNAVAILABLE');
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });

  test('a recipient that is not verified yet is refused', async () => {
    const { offer } = await createDonorOffer();
    const { client } = await recipient({ status: 'pending' });

    const res = await claim(client, offer._id);

    expect(res.status).toBe(403);
    expect((await OfferModel.findById(offer._id))?.status).toBe('open');
  });

  test('an offer the recipient cannot store looks missing', async () => {
    const { offer } = await createDonorOffer({ coldChain: 'refrigerated' });
    const { client } = await recipient({ storageRefrigerated: false });

    const res = await claim(client, offer._id);

    expect(res.status).toBe(404);
    expect((await OfferModel.findById(offer._id))?.status).toBe('open');
  });

  test('donors and coordinators cannot claim', async () => {
    const { offer } = await createDonorOffer();
    for (const client of [await staff('coordinator'), await staff('donor')]) {
      expect((await claim(client, offer._id)).status).toBe(403);
    }
  });
});

describe('releasing a claim', () => {
  test('reopens the offer and offers it again to everyone else who is eligible', async () => {
    const { offer } = await createDonorOffer();
    const first = await recipient();
    const other = await recipient();
    const claimed = ClaimResponse.parse((await claim(first.client, offer._id)).body);

    const res = await release(first.client, claimed.claim.id, 'Our van broke down');

    expect(res.status).toBe(200);
    const body = ClaimWithOfferResponse.strict().parse(res.body);
    expect(body.claim).toMatchObject({ status: 'released', releaseReason: 'Our van broke down' });
    expect(body.offer.status).toBe('open');
    await settle();
    expect(offerNotifier.calls).toHaveLength(1);
    expect(offerNotifier.calls[0]!.recipientOrganisationIds).toEqual([
      other.organisation._id.toString(),
    ]);
  });

  test('after a release another organisation can claim, and the history keeps both', async () => {
    const { offer } = await createDonorOffer();
    const first = await recipient();
    const second = await recipient();
    const claimed = ClaimResponse.parse((await claim(first.client, offer._id)).body);
    await release(first.client, claimed.claim.id);

    const res = await claim(second.client, offer._id);

    expect(res.status).toBe(201);
    expect(await ClaimModel.countDocuments({ offerId: offer._id })).toBe(2);
    expect(await ClaimModel.countDocuments({ offerId: offer._id, status: 'active' })).toBe(1);
  });

  test('a repeated release changes nothing, even after someone else has claimed', async () => {
    const { offer } = await createDonorOffer();
    const first = await recipient();
    const second = await recipient();
    const claimed = ClaimResponse.parse((await claim(first.client, offer._id)).body);
    await release(first.client, claimed.claim.id);
    await claim(second.client, offer._id);

    const repeat = await release(first.client, claimed.claim.id);

    expect(repeat.status).toBe(200);
    expect(ClaimWithOfferResponse.parse(repeat.body).claim.status).toBe('released');
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
    expect(await ClaimModel.countDocuments({ offerId: offer._id, status: 'active' })).toBe(1);
  });

  test("another organisation's claim looks missing", async () => {
    const { offer } = await createDonorOffer();
    const owner = await recipient();
    const stranger = await recipient();
    const claimed = ClaimResponse.parse((await claim(owner.client, offer._id)).body);

    expect((await release(stranger.client, claimed.claim.id)).status).toBe(404);
    expect((await ClaimModel.findById(claimed.claim.id))?.status).toBe('active');
  });

  test('a claim with a handover can no longer be released', async () => {
    const { offer } = await createDonorOffer();
    const { client } = await recipient();
    const claimed = ClaimResponse.parse((await claim(client, offer._id)).body);
    await HandoverRecordModel.create({
      claimId: new Types.ObjectId(claimed.claim.id),
      offerId: offer._id,
      donorConfirmedByUserId: new Types.ObjectId(),
      donorConfirmedAt: new Date(),
      donorPhotoUrl: 'https://local-photos.invalid/handover.jpg',
      collectedQuantityKg: 31,
      retainUntil: inHours(24 * 365 * 2),
    });

    const res = await release(client, claimed.claim.id);

    expect(res.status).toBe(409);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('INVALID_STATE');
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
  });
});

describe('listing claims', () => {
  test('a recipient sees only its own claims, and a coordinator sees all of them', async () => {
    const mine = await recipient();
    const theirs = await recipient();
    const a = await createDonorOffer();
    const b = await createDonorOffer();
    await claim(mine.client, a.offer._id);
    await claim(theirs.client, b.offer._id);

    const own = await listClaims(mine.client);
    const all = await listClaims(await staff('coordinator'));

    expect(own.items.map((c) => c.offer.id)).toEqual([a.offer._id.toString()]);
    expect(own.items[0]!.offer.title).toBe('62 loaves and 40 rolls');
    expect(all.items).toHaveLength(2);
  });

  test('filters by status', async () => {
    const { client } = await recipient();
    const a = await createDonorOffer();
    const b = await createDonorOffer();
    const kept = ClaimResponse.parse((await claim(client, a.offer._id)).body);
    const dropped = ClaimResponse.parse((await claim(client, b.offer._id)).body);
    await release(client, dropped.claim.id);

    const active = await listClaims(client, '?status=active');

    expect(active.items.map((c) => c.id)).toEqual([kept.claim.id]);
  });
});

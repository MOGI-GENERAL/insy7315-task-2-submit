import type { Offer, OfferStatus } from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  ClaimModel,
  ClaimRepository,
  CollectionModel,
  CollectionRepository,
  HandoverRecordModel,
  HandoverRepository,
  OfferModel,
  OfferRepository,
  OrganisationModel,
} from '../../src/db/index.js';
import type { ClaimService } from '../../src/services/claim-service.js';
import { ExpiryService } from '../../src/services/expiry-service.js';
import type { OfferNotifier } from '../../src/services/offer-notifier.js';
import { createOrganisation, newClaimService, newOfferService } from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

class RecordingOfferNotifier implements OfferNotifier {
  calls: Offer[] = [];
  async notifyEligible(offer: Offer) {
    this.calls.push(offer);
  }
}

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

const expiry = new ExpiryService(
  new OfferRepository(),
  new ClaimRepository(),
  new HandoverRepository(),
  new CollectionRepository(),
);
const offerNotifier = new RecordingOfferNotifier();
let claims: ClaimService;
let stopTestDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const offers = newOfferService({ notifier: offerNotifier });
  claims = newClaimService(offers, { offerNotifier });
}, START_TIMEOUT_MS);

afterAll(async () => {
  await stopTestDb?.();
});

beforeEach(async () => {
  offerNotifier.calls = [];
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    HandoverRecordModel.deleteMany({}),
    CollectionModel.deleteMany({}),
  ]);
});

let referenceCount = 0;

async function createOffer(status: OfferStatus, collectionDeadline: Date) {
  const donor = await createOrganisation({ type: 'donor' });
  referenceCount += 1;
  return OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: new Types.ObjectId(),
    reference: `E${referenceCount.toString().padStart(3, '0')}`,
    title: '62 loaves and 40 rolls',
    description: null,
    category: 'bakery',
    offeredQuantityKg: 31,
    coldChain: 'ambient',
    photoUrls: [],
    availableFrom: inHours(-4),
    collectionDeadline,
    status,
  });
}

/** a claimed offer with its active claim, as the claim lock leaves them */
async function createClaimedOffer(collectionDeadline: Date) {
  const offer = await createOffer('claimed', collectionDeadline);
  const recipient = await createOrganisation({ type: 'recipient' });
  const claim = await ClaimModel.create({
    offerId: offer._id,
    recipientOrganisationId: recipient._id,
    claimedByUserId: new Types.ObjectId(),
    claimedAt: inHours(-1),
    transportNeeded: true,
    status: 'active',
  });
  return { offer, claim };
}

function dispatchDriver(claimId: Types.ObjectId) {
  return CollectionModel.create({
    claimId,
    dispatchedByUserId: new Types.ObjectId(),
    driverName: 'Faried Salie',
    driverPhone: '+27821112222',
  });
}

const offerStatus = async (id: Types.ObjectId) => (await OfferModel.findById(id))?.status;
const claimStatus = async (id: Types.ObjectId) => (await ClaimModel.findById(id))?.status;

/** background notifications start after the reply */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('expireOverdue', () => {
  test('expires open offers past their deadline and leaves the rest open', async () => {
    const overdue = await createOffer('open', inHours(-1));
    const current = await createOffer('open', inHours(1));

    const summary = await expiry.expireOverdue();

    expect(summary.openExpired).toBe(1);
    expect(await offerStatus(overdue._id)).toBe('expired');
    expect((await OfferModel.findById(overdue._id))?.expiredAt).toBeInstanceOf(Date);
    expect(await offerStatus(current._id)).toBe('open');
  });

  test('runs exactly once when run twice, one after the other or at the same time', async () => {
    await createOffer('open', inHours(-1));
    await createClaimedOffer(inHours(-1));

    const first = await expiry.expireOverdue();
    const second = await expiry.expireOverdue();
    expect(first).toMatchObject({ openExpired: 1, claimedExpired: 1, claimsExpired: 1 });
    expect(second).toEqual({
      openExpired: 0,
      claimedExpired: 0,
      claimsExpired: 0,
      collectionsCancelled: 0,
    });

    await createOffer('open', inHours(-1));
    const together = await Promise.all([expiry.expireOverdue(), expiry.expireOverdue()]);
    expect(together.reduce((sum, run) => sum + run.openExpired, 0)).toBe(1);
  });

  test('expires a claimed offer past its deadline together with its claim and driver', async () => {
    const { offer, claim } = await createClaimedOffer(inHours(-1));
    const collection = await dispatchDriver(claim._id);

    const summary = await expiry.expireOverdue();

    expect(summary).toEqual({
      openExpired: 0,
      claimedExpired: 1,
      claimsExpired: 1,
      collectionsCancelled: 1,
    });
    expect(await offerStatus(offer._id)).toBe('expired');
    expect(await claimStatus(claim._id)).toBe('expired');
    expect((await CollectionModel.findById(collection._id))?.status).toBe('cancelled');
  });

  test('an offer claimed 1 ms before its deadline stays claimed until the deadline', async () => {
    const deadline = inHours(1);
    const { offer, claim } = await createClaimedOffer(deadline);

    await expiry.expireOverdue(new Date(deadline.getTime() - 1));
    expect(await offerStatus(offer._id)).toBe('claimed');
    expect(await claimStatus(claim._id)).toBe('active');

    await expiry.expireOverdue(deadline);
    expect(await offerStatus(offer._id)).toBe('expired');
    expect(await claimStatus(claim._id)).toBe('expired');
  });

  test('leaves a claimed offer alone once the donor has confirmed the handover', async () => {
    const { offer, claim } = await createClaimedOffer(inHours(-1));
    await HandoverRecordModel.create({
      claimId: claim._id,
      offerId: offer._id,
      donorConfirmedByUserId: new Types.ObjectId(),
      donorConfirmedAt: inHours(-2),
      donorPhotoUrl: 'https://local-photos.invalid/handover.jpg',
      collectedQuantityKg: 31,
      retainUntil: inHours(24 * 365 * 2),
    });

    const summary = await expiry.expireOverdue();

    expect(summary.claimedExpired).toBe(0);
    expect(await offerStatus(offer._id)).toBe('claimed');
    expect(await claimStatus(claim._id)).toBe('active');
  });

  test('never touches collected, cancelled or already expired offers', async () => {
    const offers = await Promise.all(
      (['collected', 'cancelled', 'expired'] as const).map((status) =>
        createOffer(status, inHours(-1)),
      ),
    );

    const summary = await expiry.expireOverdue();

    expect(summary.openExpired + summary.claimedExpired).toBe(0);
    expect(await Promise.all(offers.map((o) => offerStatus(o._id)))).toEqual([
      'collected',
      'cancelled',
      'expired',
    ]);
  });
});

describe('releasing a claim', () => {
  test('after the deadline the offer stays claimed, notifies nobody and expires on the next sweep', async () => {
    const { offer, claim } = await createClaimedOffer(inHours(-1));

    const res = await claims.release(claim._id.toString(), { reason: 'Our van broke down' });
    await settle();

    expect(res.claim.status).toBe('released');
    expect(await offerStatus(offer._id)).toBe('claimed');
    expect(offerNotifier.calls).toHaveLength(0);

    const summary = await expiry.expireOverdue();
    expect(summary).toMatchObject({ claimedExpired: 1, claimsExpired: 0 });
    expect(await offerStatus(offer._id)).toBe('expired');
    expect(await claimStatus(claim._id)).toBe('released');
  });

  test('before the deadline the offer reopens as before', async () => {
    const { offer, claim } = await createClaimedOffer(inHours(2));

    await claims.release(claim._id.toString(), {});

    expect(await offerStatus(offer._id)).toBe('open');
  });

  test('cancels a dispatched driver in the same step', async () => {
    const { claim } = await createClaimedOffer(inHours(2));
    const collection = await dispatchDriver(claim._id);

    await claims.release(claim._id.toString(), {});

    expect((await CollectionModel.findById(collection._id))?.status).toBe('cancelled');
  });
});

import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  ClaimModel,
  ClaimRepository,
  OfferModel,
  OfferRepository,
  OrganisationModel,
} from '../../src/db/index.js';
import {
  DOCUMENT_VALIDATION_FAILURE,
  DUPLICATE_KEY,
  START_TIMEOUT_MS,
  startTestDb,
} from './test-db.js';

/*
 * every insert below goes through the driver's own collection, so Mongoose
 * validation never runs and only the database's rules can reject it
 */

let stopTestDb: (() => Promise<void>) | undefined;

beforeAll(async () => {
  stopTestDb = await startTestDb();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await stopTestDb?.();
});

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000);

function validOffer() {
  const now = new Date();
  return {
    donorOrganisationId: new Types.ObjectId(),
    postedByUserId: new Types.ObjectId(),
    reference: `R${new Types.ObjectId().toHexString().slice(-6)}`,
    title: '62 loaves and 40 rolls',
    description: null,
    category: 'bakery' as const,
    offeredQuantityKg: 31,
    coldChain: 'ambient' as const,
    photoUrls: ['https://res.cloudinary.com/demo/image/upload/loaves.jpg'],
    availableFrom: now,
    collectionDeadline: inHours(2),
    status: 'open' as const,
    expiredAt: null,
    parentOfferId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function validDonorOrganisation() {
  const now = new Date();
  return {
    name: "Ouma's Bakery",
    type: 'donor',
    status: 'active',
    addressLine: '14 Albert Road',
    suburb: 'Woodstock',
    city: 'Cape Town',
    location: { type: 'Point', coordinates: [18.447, -33.928] },
    contactName: 'Riaan de Villiers',
    contactPhone: '+27821234567',
    contactEmail: 'riaan@oumasbakery.co.za',
    verifiedAt: null,
    verifiedByUserId: null,
    capacityNotes: '',
    taxReferenceNumber: null,
    createdAt: now,
    updatedAt: now,
  };
}

function activeClaim(offerId: Types.ObjectId) {
  const now = new Date();
  return {
    offerId,
    recipientOrganisationId: new Types.ObjectId(),
    claimedByUserId: new Types.ObjectId(),
    claimedAt: now,
    transportNeeded: false,
    status: 'active' as const,
    releasedAt: null,
    releaseReason: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function expectRejected(insert: Promise<unknown>, code: number) {
  await expect(insert).rejects.toMatchObject({ code });
}

describe('offers', () => {
  test('the database accepts a valid offer', async () => {
    const { insertedId } = await OfferModel.collection.insertOne(validOffer());
    expect(await OfferModel.collection.countDocuments({ _id: insertedId })).toBe(1);
  });

  test('the database rejects an offer with three photos', async () => {
    const photo = 'https://res.cloudinary.com/demo/image/upload/a.jpg';
    await expectRejected(
      OfferModel.collection.insertOne({ ...validOffer(), photoUrls: [photo, photo, photo] }),
      DOCUMENT_VALIDATION_FAILURE,
    );
  });

  test('the database rejects an offer with a negative quantity', async () => {
    await expectRejected(
      OfferModel.collection.insertOne({ ...validOffer(), offeredQuantityKg: -5 }),
      DOCUMENT_VALIDATION_FAILURE,
    );
  });

  test('the repository saves an offer inside a transaction', async () => {
    const offers = new OfferRepository();
    const saved = await mongoose.connection.transaction((session) =>
      offers.create(validOffer(), session),
    );
    expect((await offers.findById(saved._id))?.title).toBe('62 loaves and 40 rolls');
  });
});

describe('organisations', () => {
  test('the database accepts a valid organisation', async () => {
    await expect(
      OrganisationModel.collection.insertOne(validDonorOrganisation()),
    ).resolves.toBeDefined();
  });

  test('the database rejects a phone number that is not E.164', async () => {
    await expectRejected(
      OrganisationModel.collection.insertOne({
        ...validDonorOrganisation(),
        contactPhone: '082 123 4567',
      }),
      DOCUMENT_VALIDATION_FAILURE,
    );
  });
});

describe('claims', () => {
  test('the database allows only one active claim per offer', async () => {
    const offerId = new Types.ObjectId();
    const first = await new ClaimRepository().create(activeClaim(offerId));
    expect(first.status).toBe('active');

    // a released claim on the same offer is history and must still be allowed
    await ClaimModel.collection.insertOne({
      ...activeClaim(offerId),
      status: 'released',
      releasedAt: new Date(),
    });

    await expectRejected(ClaimModel.collection.insertOne(activeClaim(offerId)), DUPLICATE_KEY);
  });
});

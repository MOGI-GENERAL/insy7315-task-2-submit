import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ErrorEnvelope,
  IDEMPOTENCY_HEADER,
  MAX_PHOTO_BYTES,
  OfferDetailResponse,
  OfferListResponse,
  OfferResponse,
  PostOfferResponse,
  type Offer,
  type OfferStatus,
  type Suburb,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  CollectionModel,
  HandoverRecordModel,
  OfferModel,
  OrganisationModel,
} from '../../src/db/index.js';
import { LOCAL_PHOTO_BASE_URL, LocalPhotoStore } from '../../src/photos/local-photo-store.js';
import type { OfferNotifier } from '../../src/services/offer-notifier.js';
import { REFERENCE_ALPHABET } from '../../src/services/offer-reference.js';
import type { TestClient } from '../test-client.js';
import {
  anonymousClient,
  createOrganisation,
  createUser,
  newOfferService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

/** keeps what the service hands over, and lets a test decide how the hand-over ends */
class RecordingNotifier implements OfferNotifier {
  calls: { offer: Offer; recipientOrganisationIds: string[] }[] = [];
  outcome: () => Promise<void> = async () => {};

  notifyEligible(offer: Offer, recipientOrganisationIds: string[]) {
    this.calls.push({ offer, recipientOrganisationIds });
    return this.outcome();
  }
}

const notifier = new RecordingNotifier();
let photoDir = '';
let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let coordinator: TestClient;
let coordinatorId: Types.ObjectId;

beforeAll(async () => {
  stopTestDb = await startTestDb();
  photoDir = await mkdtemp(join(tmpdir(), 'fedsa-offer-photos-'));
  const app = await startTestApp(
    [],
    newOfferService({ photos: new LocalPhotoStore(photoDir), notifier }),
  );
  closeApp = app.close;
  baseUrl = app.baseUrl;
  const user = await createUser({ role: 'coordinator' });
  coordinatorId = user._id;
  coordinator = await signedInClient(baseUrl, user.email);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
  if (photoDir) await rm(photoDir, { recursive: true, force: true });
});

// every test starts with no organisations or offers, so recipient lists and counts are its own
beforeEach(async () => {
  notifier.calls = [];
  notifier.outcome = async () => {};
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    CollectionModel.deleteMany({}),
    HandoverRecordModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);
});

const HOUR = 60 * 60 * 1000;

function inHours(hours: number) {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(14),
]);
const GIF = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
const TEXT = Buffer.from('this is a shopping list, not a photo');

interface Attachment {
  bytes: Buffer;
  type: string;
  name: string;
  field?: string;
}

const png: Attachment = { bytes: PNG, type: 'image/png', name: 'bread.png' };
const jpeg: Attachment = { bytes: JPEG, type: 'image/jpeg', name: 'bread.jpg' };
const webp: Attachment = { bytes: WEBP, type: 'image/webp', name: 'bread.webp' };

type Fields = Record<string, string | number | undefined>;

function offerFields(overrides: Fields = {}): Fields {
  return {
    title: '62 loaves and 40 rolls',
    description: 'Baked this morning',
    category: 'bakery',
    offeredQuantityKg: 31,
    coldChain: 'ambient',
    collectionDeadline: inHours(4),
    ...overrides,
  };
}

function offerForm(fields: Fields, attachments: Attachment[]) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(name, String(value));
  }
  for (const file of attachments) {
    form.append(
      file.field ?? 'photos',
      new Blob([new Uint8Array(file.bytes)], { type: file.type }),
      file.name,
    );
  }
  return form;
}

function post(
  client: TestClient,
  fields = offerFields(),
  attachments: Attachment[] = [],
  headers: Record<string, string> = {},
) {
  return client.request('POST', '/api/offers', offerForm(fields, attachments), headers);
}

async function postOffer(
  client: TestClient,
  fields = offerFields(),
  attachments: Attachment[] = [],
) {
  const res = await post(client, fields, attachments);
  if (res.status !== 201) throw new Error(`posting failed with ${res.status}: ${await res.text()}`);
  return PostOfferResponse.parse(await res.json()).offer;
}

async function list(client: TestClient, query: string) {
  const res = await client.get(`/api/offers?${query}`);
  expect(res.status).toBe(200);
  return OfferListResponse.parse(await res.json());
}

function ids(body: { items: { id: string }[] }) {
  return body.items.map((item) => item.id);
}

async function errorOf(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error;
}

async function memberOf(organisation: { _id: Types.ObjectId; type: 'donor' | 'recipient' }) {
  const user = await createUser({ role: organisation.type, organisationId: organisation._id });
  return signedInClient(baseUrl, user.email);
}

async function donor(name = "Ouma's Bakery", suburb: Suburb = 'Woodstock') {
  const organisation = await createOrganisation({ type: 'donor', name, suburb });
  return { organisation, client: await memberOf(organisation) };
}

type RecipientFields = Omit<Parameters<typeof createOrganisation>[0], 'type'>;

/** a verified recipient a few kilometres from the Woodstock donor, with dry storage only */
async function recipient(fields: RecipientFields = {}) {
  const organisation = await createOrganisation({
    type: 'recipient',
    suburb: 'Observatory',
    ...fields,
  });
  return { organisation, client: await memberOf(organisation) };
}

let storedCount = 0;

/** for states and times the API cannot produce. a `0` never appears in a generated reference */
function insertOffer(donorOrganisationId: Types.ObjectId, fields: Record<string, unknown> = {}) {
  storedCount += 1;
  return OfferModel.create({
    donorOrganisationId,
    postedByUserId: new Types.ObjectId(),
    reference: `Z0${storedCount}`,
    title: 'Stored offer',
    category: 'bakery',
    offeredQuantityKg: 10,
    coldChain: 'ambient',
    availableFrom: new Date(),
    collectionDeadline: new Date(Date.now() + 4 * HOUR),
    status: 'open',
    ...fields,
  });
}

function photoFiles() {
  return readdir(photoDir);
}

function fileNameOf(url: string) {
  return url.slice(url.lastIndexOf('/') + 1);
}

describe('posting', () => {
  test('a donor posts an offer without photos and gets a short reference back', async () => {
    const { organisation, client } = await donor();
    const before = Date.now();

    const res = await post(client);

    expect(res.status).toBe(201);
    const body = PostOfferResponse.parse(await res.json());
    expect(body.offer).toMatchObject({
      donorOrganisationId: organisation._id.toString(),
      donor: { id: organisation._id.toString(), name: "Ouma's Bakery", suburb: 'Woodstock' },
      title: '62 loaves and 40 rolls',
      description: 'Baked this morning',
      category: 'bakery',
      offeredQuantityKg: 31,
      coldChain: 'ambient',
      photos: [],
      status: 'open',
      expiredAt: null,
      parentOfferId: null,
    });
    expect(body.offer.reference).toMatch(new RegExp(`^[${REFERENCE_ALPHABET}]{4}$`));
    expect(Date.parse(body.offer.availableFrom)).toBeGreaterThanOrEqual(before - 1000);

    const stored = await OfferModel.findById(body.offer.id).lean();
    expect(stored!.postedByUserId.toString()).toBe(body.offer.postedByUserId);
    expect(stored!.reference).toBe(body.offer.reference);
    expect(stored!.clientRequestId).toBeUndefined();
  });

  test.each([
    ['JPEG', jpeg, 'jpg'],
    ['PNG', png, 'png'],
    ['WebP', webp, 'webp'],
  ] as const)('a %s photo is stored and listed as a thumbnail', async (_kind, file, extension) => {
    const { client } = await donor();

    const offer = await postOffer(client, offerFields(), [file]);

    expect(offer.photos).toEqual([{ thumbUrl: expect.stringContaining('/thumb/') }]);
    const stored = await OfferModel.findById(offer.id).lean();
    expect(stored!.photoUrls).toHaveLength(1);
    const url = stored!.photoUrls[0]!;
    expect(url.startsWith(`${LOCAL_PHOTO_BASE_URL}/`)).toBe(true);
    expect(url.endsWith(`.${extension}`)).toBe(true);
    expect(await readFile(join(photoDir, fileNameOf(url)))).toEqual(file.bytes);
  });

  test('two photos keep their order, and only the detail route gives the full size', async () => {
    const { client } = await donor();

    const offer = await postOffer(client, offerFields(), [jpeg, webp]);
    const detail = OfferDetailResponse.parse(
      await (await client.get(`/api/offers/${offer.id}`)).json(),
    );

    const stored = await OfferModel.findById(offer.id).lean();
    expect(stored!.photoUrls.map((url) => url.split('.').pop())).toEqual(['jpg', 'webp']);
    expect(offer.photos.every((photo) => photo.url === undefined)).toBe(true);
    expect(detail.offer.photos).toEqual(
      stored!.photoUrls.map((url) => ({ thumbUrl: expect.stringContaining('/thumb/'), url })),
    );
  });

  test('photos sent under photos[] are accepted too', async () => {
    const { client } = await donor();

    const offer = await postOffer(client, offerFields(), [
      { ...png, field: 'photos[]' },
      { ...jpeg, field: 'photos[]' },
    ]);

    expect(offer.photos).toHaveLength(2);
  });

  test('a scheduled offer keeps its available time', async () => {
    const { client } = await donor();
    const availableFrom = inHours(48);

    const offer = await postOffer(
      client,
      offerFields({ availableFrom, collectionDeadline: inHours(52) }),
    );

    expect(offer.availableFrom).toBe(availableFrom);
  });

  test('fields that fail the contract are named, and no photo is stored', async () => {
    const { organisation, client } = await donor();
    const before = await photoFiles();

    const res = await post(client, offerFields({ title: 'ab', offeredQuantityKg: 0 }), [png]);
    const late = await post(client, offerFields({ collectionDeadline: inHours(-1) }));

    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['offeredQuantityKg', 'title']);
    expect((await errorOf(late)).fields).toHaveProperty('collectionDeadline');
    expect(await OfferModel.countDocuments({ donorOrganisationId: organisation._id })).toBe(0);
    expect(await photoFiles()).toEqual(before);
  });

  test('only a donor can post', async () => {
    const { client: recipientClient } = await recipient();

    const asRecipient = await post(recipientClient);
    const asCoordinator = await post(coordinator);
    const anonymous = await post(await anonymousClient(baseUrl));

    expect(asRecipient.status).toBe(403);
    expect(asCoordinator.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect(await OfferModel.countDocuments()).toBe(0);
  });
});

describe('rejected uploads', () => {
  const cases: { name: string; files: Attachment[] }[] = [
    { name: 'a text file that claims to be a JPEG', files: [{ ...jpeg, bytes: TEXT }] },
    { name: 'a GIF', files: [{ bytes: GIF, type: 'image/gif', name: 'bread.gif' }] },
    {
      name: 'a photo over 5 MB',
      files: [{ ...jpeg, bytes: Buffer.concat([JPEG, Buffer.alloc(MAX_PHOTO_BYTES)]) }],
    },
    { name: 'a third photo', files: [png, jpeg, webp] },
    {
      name: 'a third photo across both field names',
      files: [png, jpeg, { ...webp, field: 'photos[]' }],
    },
    { name: 'a photo under another field name', files: [{ ...png, field: 'image' }] },
    { name: 'a good photo sent with a bad one', files: [png, { ...png, bytes: TEXT }] },
  ];

  test.each(cases)('$name is refused and nothing is stored', async ({ files }) => {
    const { organisation, client } = await donor();
    const before = await photoFiles();

    const res = await post(client, offerFields(), files);

    expect(res.status).toBe(422);
    expect((await errorOf(res)).code).toBe('UPLOAD_REJECTED');
    expect(await OfferModel.countDocuments({ donorOrganisationId: organisation._id })).toBe(0);
    expect(await photoFiles()).toEqual(before);
    expect(notifier.calls).toHaveLength(0);
  });
});

describe('references', () => {
  test('a reference that is already taken is replaced with a fresh one', async () => {
    const queue = ['K4F2', 'K4F2', 'M7P3'];
    const app = await startTestApp(
      [],
      newOfferService({ notifier, newReference: () => queue.shift() ?? 'Q9W8' }),
    );
    try {
      const organisation = await createOrganisation({ type: 'donor' });
      const user = await createUser({ role: 'donor', organisationId: organisation._id });
      const client = await signedInClient(app.baseUrl, user.email);

      const first = await postOffer(client);
      const second = await postOffer(client);

      expect(first.reference).toBe('K4F2');
      expect(second.reference).toBe('M7P3');
      expect(await OfferModel.countDocuments()).toBe(2);
    } finally {
      await app.close();
    }
  });
});

describe('idempotency', () => {
  test('repeating a post with the same key returns the original offer and creates nothing new', async () => {
    const { organisation, client } = await donor();
    await recipient();
    const headers = { [IDEMPOTENCY_HEADER]: randomUUID() };

    const first = await post(client, offerFields(), [png], headers);
    const filesAfterFirst = await photoFiles();
    const second = await post(client, offerFields({ title: 'Something else' }), [png], headers);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const original = PostOfferResponse.parse(await first.json());
    const repeat = PostOfferResponse.parse(await second.json());
    expect(repeat).toEqual(original);
    expect(repeat.notifiedCount).toBe(1);
    expect(await OfferModel.countDocuments({ donorOrganisationId: organisation._id })).toBe(1);
    expect(await photoFiles()).toEqual(filesAfterFirst);
    expect(notifier.calls).toHaveLength(1);
  });

  test('repeats that arrive together still create one offer', async () => {
    const { client } = await donor();
    const headers = { [IDEMPOTENCY_HEADER]: randomUUID() };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => post(client, offerFields(), [], headers)),
    );

    const bodies = await Promise.all(
      responses.map(async (res) => {
        expect(res.status).toBe(201);
        return PostOfferResponse.parse(await res.json());
      }),
    );
    expect(new Set(bodies.map((body) => body.offer.id)).size).toBe(1);
    expect(await OfferModel.countDocuments()).toBe(1);
    expect(notifier.calls).toHaveLength(1);
  });

  test('two donors using the same key each get their own offer', async () => {
    const first = await donor();
    const second = await donor('Kaap Foods', 'Salt River');
    const headers = { [IDEMPOTENCY_HEADER]: randomUUID() };

    const a = PostOfferResponse.parse(
      await (await post(first.client, offerFields(), [], headers)).json(),
    );
    const b = PostOfferResponse.parse(
      await (await post(second.client, offerFields(), [], headers)).json(),
    );

    expect(a.offer.id).not.toBe(b.offer.id);
    expect(b.offer.donorOrganisationId).toBe(second.organisation._id.toString());
    expect(await OfferModel.countDocuments()).toBe(2);
  });

  test('a key that is too long is refused', async () => {
    const { client } = await donor();

    const res = await post(client, offerFields(), [], { [IDEMPOTENCY_HEADER]: 'k'.repeat(65) });

    expect(res.status).toBe(400);
    expect((await errorOf(res)).fields).toHaveProperty(IDEMPOTENCY_HEADER);
    expect(await OfferModel.countDocuments()).toBe(0);
  });
});

describe('eligible recipients', () => {
  test('are handed to the notifier in name order and counted in the reply', async () => {
    const { client } = await donor();
    const fridge = { storageRefrigerated: true };
    const zion = await createOrganisation({
      type: 'recipient',
      name: 'Zion Soup Kitchen',
      suburb: 'Observatory',
      ...fridge,
    });
    const amandla = await createOrganisation({
      type: 'recipient',
      name: 'Amandla Shelter',
      suburb: 'Salt River',
      status: 'active',
      maxCapacityKg: 31,
      ...fridge,
    });
    const hope = await createOrganisation({
      type: 'recipient',
      name: 'Hope House',
      hasTransport: true,
      ...fridge,
    });
    await createOrganisation({ type: 'recipient', name: 'Dry Goods Only' });
    await createOrganisation({
      type: 'recipient',
      name: 'Far Away Shelter',
      suburb: 'Khayelitsha',
      ...fridge,
    });
    await createOrganisation({
      type: 'recipient',
      name: 'Small Kitchen',
      maxCapacityKg: 10,
      ...fridge,
    });
    for (const status of ['pending', 'rejected', 'suspended'] as const) {
      await createOrganisation({
        type: 'recipient',
        name: `A ${status} shelter`,
        status,
        ...fridge,
      });
    }
    await createOrganisation({ type: 'donor', name: 'Another Bakery' });

    const res = await post(
      client,
      offerFields({ coldChain: 'refrigerated', offeredQuantityKg: 31 }),
    );

    const body = PostOfferResponse.parse(await res.json());
    expect(body.notifiedCount).toBe(3);
    expect(notifier.calls).toHaveLength(1);
    expect(notifier.calls[0]!.offer).toEqual(body.offer);
    expect(notifier.calls[0]!.recipientOrganisationIds).toEqual(
      [amandla, hope, zion].map((o) => o._id.toString()),
    );
  });

  test('the reply does not wait for the notifier', async () => {
    const { client } = await donor();
    notifier.outcome = () => new Promise(() => {});

    const res = await post(client);

    expect(res.status).toBe(201);
    expect(notifier.calls).toHaveLength(1);
  });

  test('a notifier that fails does not fail the post', async () => {
    const { client } = await donor();
    notifier.outcome = async () => {
      throw new Error('provider unreachable');
    };

    const res = await post(client);

    expect(res.status).toBe(201);
    const offer = PostOfferResponse.parse(await res.json()).offer;
    expect((await client.get(`/api/offers/${offer.id}`)).status).toBe(200);
  });

  test('the feed, the detail route and the notifier agree for every recipient', async () => {
    const { client } = await donor();
    const recipients = await Promise.all([
      recipient({ name: 'Fridge Near', storageRefrigerated: true }),
      recipient({ name: 'Fridge Far', suburb: 'Khayelitsha', storageRefrigerated: true }),
      recipient({ name: 'Fridge Small', storageRefrigerated: true, maxCapacityKg: 5 }),
      recipient({ name: 'Fridge Exact', storageRefrigerated: true, maxCapacityKg: 31 }),
      recipient({ name: 'Fridge Pending', storageRefrigerated: true, status: 'pending' }),
      recipient({ name: 'No Fridge' }),
      recipient({ name: 'Freezer Only', storageAmbient: false, storageFrozen: true }),
    ]);

    const offer = await postOffer(
      client,
      offerFields({ coldChain: 'refrigerated', offeredQuantityKg: 31 }),
    );

    const notified = notifier.calls[0]!.recipientOrganisationIds;
    expect(notified).toHaveLength(2);
    for (const { organisation, client: recipientClient } of recipients) {
      const inFeed = ids(await list(recipientClient, 'view=feed')).includes(offer.id);
      const detail = await recipientClient.get(`/api/offers/${offer.id}`);
      const expected = notified.includes(organisation._id.toString());

      expect(inFeed, organisation.name).toBe(expected);
      expect(detail.status, organisation.name).toBe(expected ? 200 : 404);
    }
  });
});

describe('a recipient without a fridge', () => {
  test('never sees a refrigerated offer through any endpoint', async () => {
    const { client: donorClient } = await donor();
    const { organisation, client } = await recipient({ storageFrozen: true });
    const chilled = await postOffer(donorClient, offerFields({ coldChain: 'refrigerated' }));
    const chilledLater = await postOffer(
      donorClient,
      offerFields({
        coldChain: 'refrigerated',
        availableFrom: inHours(24),
        collectionDeadline: inHours(30),
      }),
    );
    const dry = await postOffer(donorClient, offerFields({ coldChain: 'ambient' }));
    const frozen = await postOffer(donorClient, offerFields({ coldChain: 'frozen' }));
    const hidden = [chilled.id, chilledLater.id];

    const feed = await client.get('/api/offers?view=feed');
    const responses = [
      feed,
      await client.get('/api/offers?view=scheduled'),
      await client.get('/api/offers?view=feed&status=open'),
      await client.get('/api/offers?view=scheduled&status=open'),
      await client.get('/api/offers?view=mine'),
      await client.get('/api/offers?view=all'),
      ...(await Promise.all(hidden.map((id) => client.get(`/api/offers/${id}`)))),
      ...(await Promise.all(hidden.map((id) => client.post(`/api/offers/${id}/cancel`, {})))),
    ];

    for (const res of responses) {
      const text = await res.clone().text();
      for (const id of hidden) expect(text).not.toContain(id);
    }
    expect(ids(OfferListResponse.parse(await feed.json())).sort()).toEqual(
      [dry.id, frozen.id].sort(),
    );
    for (const call of notifier.calls.filter((c) => hidden.includes(c.offer.id))) {
      expect(call.recipientOrganisationIds).not.toContain(organisation._id.toString());
    }
  });
});

describe('views', () => {
  test('the feed shows open offers available now, newest first, with thumbnails only', async () => {
    const { client: donorClient } = await donor();
    const { client } = await recipient();
    const older = await postOffer(donorClient, offerFields(), [png]);
    const newer = await postOffer(donorClient);

    const body = await list(client, 'view=feed');

    expect(ids(body)).toEqual([newer.id, older.id]);
    expect(body.nextCursor).toBeNull();
    expect(body.items[1]!.photos).toEqual([{ thumbUrl: expect.stringContaining('/thumb/') }]);
  });

  test('the feed leaves out offers that are not open or are past their deadline', async () => {
    const { organisation } = await donor();
    const { client } = await recipient();
    const visible = await insertOffer(organisation._id);
    for (const status of ['claimed', 'collected', 'expired', 'cancelled'] as const) {
      await insertOffer(organisation._id, { status });
    }
    await insertOffer(organisation._id, {
      availableFrom: new Date(Date.now() - 6 * HOUR),
      collectionDeadline: new Date(Date.now() - HOUR),
    });
    await insertOffer(organisation._id, {
      availableFrom: new Date(Date.now() + 24 * HOUR),
      collectionDeadline: new Date(Date.now() + 30 * HOUR),
    });

    expect(ids(await list(client, 'view=feed'))).toEqual([visible._id.toString()]);
  });

  test('a scheduled offer shows in the scheduled view until its time comes, then in the feed', async () => {
    const { client: donorClient } = await donor();
    const { client } = await recipient();
    const offer = await postOffer(
      donorClient,
      offerFields({ availableFrom: inHours(48), collectionDeadline: inHours(52) }),
    );

    expect(ids(await list(client, 'view=scheduled'))).toEqual([offer.id]);
    expect(ids(await list(client, 'view=feed'))).toEqual([]);
    const detail = await client.get(`/api/offers/${offer.id}`);
    expect(detail.status).toBe(200);
    expect(OfferDetailResponse.parse(await detail.json()).offer.availableFrom).toBe(
      offer.availableFrom,
    );

    await OfferModel.updateOne(
      { _id: offer.id },
      { $set: { availableFrom: new Date(Date.now() - HOUR) } },
    );

    expect(ids(await list(client, 'view=scheduled'))).toEqual([]);
    expect(ids(await list(client, 'view=feed'))).toEqual([offer.id]);
  });

  test.each(['pending', 'rejected', 'suspended'] as const)(
    'a %s recipient sees no offers at all',
    async (status) => {
      const { client: donorClient } = await donor();
      const { client: verifiedClient } = await recipient();
      const { client } = await recipient({ status });
      const now = await postOffer(donorClient);
      await postOffer(
        donorClient,
        offerFields({ availableFrom: inHours(48), collectionDeadline: inHours(52) }),
      );

      expect(ids(await list(verifiedClient, 'view=feed'))).toEqual([now.id]);
      expect(ids(await list(client, 'view=feed'))).toEqual([]);
      expect(ids(await list(client, 'view=scheduled'))).toEqual([]);
      expect((await client.get(`/api/offers/${now.id}`)).status).toBe(404);
    },
  );

  test('mine shows a donor its own offers in every status and nothing from other donors', async () => {
    const { organisation, client } = await donor();
    const other = await donor('Kaap Foods', 'Salt River');
    const posted = await postOffer(client);
    const cancelled = await insertOffer(organisation._id, { status: 'cancelled' });
    const collected = await insertOffer(organisation._id, { status: 'collected' });
    await postOffer(other.client);

    expect(ids(await list(client, 'view=mine'))).toEqual([
      collected._id.toString(),
      cancelled._id.toString(),
      posted.id,
    ]);
    expect(ids(await list(client, 'view=mine&status=cancelled'))).toEqual([
      cancelled._id.toString(),
    ]);
  });

  test('all shows a coordinator every offer, filtered by status and by South African day', async () => {
    const first = await donor();
    const second = await donor('Kaap Foods', 'Salt River');
    const at = (iso: string, status: OfferStatus = 'expired') =>
      insertOffer(first.organisation._id, {
        availableFrom: new Date(iso),
        collectionDeadline: new Date(Date.parse(iso) + HOUR),
        status,
      });
    await at('2026-03-10T21:30:00.000Z');
    const earlyEleventh = await at('2026-03-10T22:30:00.000Z');
    const lateEleventh = await at('2026-03-11T21:59:00.000Z', 'collected');
    const twelfth = await at('2026-03-11T22:00:00.000Z');
    const today = await postOffer(second.client);

    const everything = await list(coordinator, 'view=all');
    const eleventh = await list(coordinator, 'view=all&from=2026-03-11&to=2026-03-11');
    const fromEleventh = await list(coordinator, 'view=all&from=2026-03-11&to=2026-03-12');
    const collectedOnly = await list(coordinator, 'view=all&status=collected');

    expect(everything.items).toHaveLength(5);
    expect(everything.items.map((o) => o.donor.name)).toContain('Kaap Foods');
    expect(ids(eleventh)).toEqual([lateEleventh._id.toString(), earlyEleventh._id.toString()]);
    expect(ids(fromEleventh)).toEqual([
      twelfth._id.toString(),
      lateEleventh._id.toString(),
      earlyEleventh._id.toString(),
    ]);
    expect(ids(collectedOnly)).toEqual([lateEleventh._id.toString()]);
    expect(ids(everything)[0]).toBe(today.id);
  });

  test('each view is refused to the roles it is not for', async () => {
    const { client: donorClient } = await donor();
    const { client: recipientClient } = await recipient();
    const admin = await signedInClient(
      baseUrl,
      (await createUser({ role: 'administrator' })).email,
    );
    const refused: [TestClient, string][] = [
      [donorClient, 'feed'],
      [donorClient, 'scheduled'],
      [donorClient, 'all'],
      [recipientClient, 'mine'],
      [recipientClient, 'all'],
      [coordinator, 'feed'],
      [coordinator, 'scheduled'],
      [coordinator, 'mine'],
      [admin, 'all'],
    ];

    for (const [client, view] of refused) {
      const res = await client.get(`/api/offers?view=${view}`);
      expect(res.status, view).toBe(403);
      expect((await errorOf(res)).code).toBe('FORBIDDEN');
    }
    expect((await (await anonymousClient(baseUrl)).get('/api/offers?view=feed')).status).toBe(401);
    expect((await recipientClient.get('/api/offers?view=everything')).status).toBe(400);
    expect((await recipientClient.get('/api/offers')).status).toBe(400);
  });

  test('pages follow the cursor to the end of the list', async () => {
    const { organisation } = await donor();
    for (let i = 0; i < 55; i += 1) await insertOffer(organisation._id);

    const first = await list(coordinator, 'view=all');
    const second = await list(coordinator, `view=all&cursor=${first.nextCursor}`);

    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toBe(first.items[49]!.id);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const all = [...ids(first), ...ids(second)];
    expect(new Set(all).size).toBe(55);
    expect(all).toEqual([...all].sort().reverse());

    const bad = await coordinator.get('/api/offers?view=all&cursor=not-a-cursor');
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).fields).toHaveProperty('cursor');
  });
});

describe('one offer', () => {
  /** a claim with a dispatched driver and a donor-confirmed handover, as later steps will create them */
  async function claimed(offerId: string, recipientOrganisationId: Types.ObjectId) {
    await OfferModel.updateOne({ _id: offerId }, { $set: { status: 'claimed' } });
    const claim = await ClaimModel.create({
      offerId,
      recipientOrganisationId,
      claimedByUserId: new Types.ObjectId(),
      transportNeeded: true,
    });
    await CollectionModel.create({
      claimId: claim._id,
      dispatchedByUserId: coordinatorId,
      driverName: 'Faried Salie',
      driverPhone: '+27821112222',
    });
    await HandoverRecordModel.create({
      claimId: claim._id,
      offerId,
      donorConfirmedByUserId: new Types.ObjectId(),
      donorConfirmedAt: new Date(),
      donorPhotoUrl: `${LOCAL_PHOTO_BASE_URL}/handover.jpg`,
      collectedQuantityKg: 30,
      retainUntil: new Date(Date.now() + 24 * 30 * 24 * HOUR),
    });
    return claim;
  }

  test('a donor opens its own offer, and another donor finds nothing', async () => {
    const { client } = await donor();
    const other = await donor('Kaap Foods', 'Salt River');
    const offer = await postOffer(client, offerFields(), [png]);

    const own = await client.get(`/api/offers/${offer.id}`);
    const hidden = await other.client.get(`/api/offers/${offer.id}`);
    const missing = await other.client.get(`/api/offers/${new Types.ObjectId()}`);

    expect(own.status).toBe(200);
    expect(OfferDetailResponse.parse(await own.json())).toMatchObject({
      offer: { id: offer.id },
      claim: null,
      collection: null,
      handover: null,
    });
    expect(hidden.status).toBe(404);
    expect(await hidden.text()).toBe(await missing.text());
    expect((await client.get('/api/offers/not-an-id')).status).toBe(400);
  });

  test('the claim, collection and handover go to the parties and not to other recipients', async () => {
    const { client: donorClient } = await donor();
    const claimant = await recipient({ name: 'Siyakhula Shelter' });
    const bystander = await recipient({ name: 'St Michael' });
    const offer = await postOffer(donorClient);
    const claim = await claimed(offer.id, claimant.organisation._id);

    for (const client of [donorClient, claimant.client, coordinator]) {
      const body = OfferDetailResponse.parse(
        await (await client.get(`/api/offers/${offer.id}`)).json(),
      );
      expect(body.offer.status).toBe('claimed');
      expect(body.claim).toMatchObject({
        id: claim._id.toString(),
        recipient: { name: 'Siyakhula Shelter' },
        transportNeeded: true,
        status: 'active',
      });
      expect(body.collection).toMatchObject({ driverName: 'Faried Salie' });
      expect(body.handover!.donorPhotoThumbUrl).toBe(`${LOCAL_PHOTO_BASE_URL}/thumb/handover.jpg`);
      expect(JSON.stringify(body)).not.toContain(`${LOCAL_PHOTO_BASE_URL}/handover.jpg`);
    }

    const forBystander = await bystander.client.get(`/api/offers/${offer.id}`);
    expect(forBystander.status).toBe(200);
    const text = await forBystander.text();
    expect(OfferDetailResponse.parse(JSON.parse(text))).toMatchObject({
      claim: null,
      collection: null,
      handover: null,
    });
    expect(text).not.toContain('Siyakhula');
    expect(text).not.toContain('Faried');
  });

  test('a recipient keeps seeing an offer it claimed after it stops being eligible', async () => {
    const { client: donorClient } = await donor();
    const claimant = await recipient();
    const other = await recipient({ name: 'St Michael' });
    const offer = await postOffer(donorClient);
    await claimed(offer.id, claimant.organisation._id);

    await OrganisationModel.updateMany({ type: 'recipient' }, { $set: { storageAmbient: false } });

    expect((await claimant.client.get(`/api/offers/${offer.id}`)).status).toBe(200);
    expect((await other.client.get(`/api/offers/${offer.id}`)).status).toBe(404);
  });
});

describe('cancelling', () => {
  function cancel(client: TestClient, id: string, reason?: string) {
    return client.post(`/api/offers/${id}/cancel`, reason === undefined ? {} : { reason });
  }

  test('a donor cancels its own open offer and it leaves the feed', async () => {
    const { client } = await donor();
    const { client: recipientClient } = await recipient();
    const offer = await postOffer(client);
    expect(ids(await list(recipientClient, 'view=feed'))).toEqual([offer.id]);

    const res = await cancel(client, offer.id, 'The bread went to the staff instead');

    expect(res.status).toBe(200);
    expect(OfferResponse.parse(await res.json()).offer).toMatchObject({
      id: offer.id,
      status: 'cancelled',
    });
    expect((await OfferModel.findById(offer.id).lean())!.status).toBe('cancelled');
    expect(ids(await list(recipientClient, 'view=feed'))).toEqual([]);
    expect(await AuditLogModel.countDocuments()).toBe(0);
  });

  test('cancelling again returns the cancelled offer', async () => {
    const { client } = await donor();
    const offer = await postOffer(client);
    await cancel(client, offer.id);

    const again = await cancel(client, offer.id);

    expect(again.status).toBe(200);
    expect(OfferResponse.parse(await again.json()).offer.status).toBe('cancelled');
  });

  test('another donor finds nothing to cancel and a recipient is refused', async () => {
    const { client } = await donor();
    const other = await donor('Kaap Foods', 'Salt River');
    const { client: recipientClient } = await recipient();
    const offer = await postOffer(client);

    const asOther = await cancel(other.client, offer.id);
    const asRecipient = await cancel(recipientClient, offer.id);
    const missing = await cancel(client, new Types.ObjectId().toString());

    expect(asOther.status).toBe(404);
    expect(asRecipient.status).toBe(403);
    expect(missing.status).toBe(404);
    expect((await OfferModel.findById(offer.id).lean())!.status).toBe('open');
  });

  test.each(['claimed', 'collected', 'expired'] as const)(
    'a %s offer cannot be cancelled by its donor or a coordinator',
    async (status) => {
      const { organisation, client } = await donor();
      const offer = await insertOffer(organisation._id, { status });

      const byDonor = await cancel(client, offer._id.toString());
      const byCoordinator = await cancel(coordinator, offer._id.toString(), 'Duplicate listing');

      for (const res of [byDonor, byCoordinator]) {
        expect(res.status).toBe(409);
        expect((await errorOf(res)).code).toBe('INVALID_STATE');
      }
      expect((await OfferModel.findById(offer._id).lean())!.status).toBe(status);
      expect(await AuditLogModel.countDocuments()).toBe(0);
    },
  );

  test("a coordinator cancels any donor's open offer and the cancellation is audited with the reason", async () => {
    const { client } = await donor();
    const offer = await postOffer(client);

    const res = await cancel(coordinator, offer.id, 'Donor phoned to say the food has gone');
    const again = await cancel(coordinator, offer.id, 'Pressed twice');

    expect(res.status).toBe(200);
    expect(OfferResponse.parse(await res.json()).offer.status).toBe('cancelled');
    expect(again.status).toBe(200);
    const entries = await AuditLogModel.find({ targetId: offer.id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: coordinatorId,
      action: 'cancel_offer',
      targetType: 'offers',
      note: 'Donor phoned to say the food has gone',
    });
  });

  test('a coordinator cancellation without a reason is audited with no note', async () => {
    const { client } = await donor();
    const offer = await postOffer(client);

    await cancel(coordinator, offer.id);

    const entry = await AuditLogModel.findOne({ targetId: offer.id }).lean();
    expect(entry).toMatchObject({ action: 'cancel_offer', note: null });
  });
});

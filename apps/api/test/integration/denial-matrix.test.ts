import {
  ErrorEnvelope,
  ROUTES,
  routeKey,
  type ErrorCode,
  type Role,
  type Route,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  ClaimModel,
  CollectionModel,
  HandoverRecordModel,
  NotificationModel,
  OfferModel,
  TaxCertificateModel,
} from '../../src/db/index.js';
import {
  TEST_PASSWORD,
  anonymousClient,
  createOrganisation,
  createUser,
  donorRegistration,
  newNotificationService,
  newOfferService,
  signedInClient,
  startTestApp,
  uniqueEmail,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

const CALLERS = [
  'anonymous',
  'donor',
  'recipient',
  'coordinator',
  'administrator',
  'otherDonor',
  'otherRecipient',
] as const;
type Caller = (typeof CALLERS)[number];
type SignedInCaller = Exclude<Caller, 'anonymous'>;

const ROLE: Record<SignedInCaller, Role> = {
  donor: 'donor',
  recipient: 'recipient',
  coordinator: 'coordinator',
  administrator: 'administrator',
  otherDonor: 'donor',
  otherRecipient: 'recipient',
};

/** the organisations the records below do not belong to */
const OUTSIDERS: ReadonlySet<Caller> = new Set(['otherDonor', 'otherRecipient']);

/**
 * one donor's chilled offer, claimed by a recipient with a fridge. the other
 * recipient has no fridge, so the offer is out of its reach as well as not its own
 */
interface World {
  users: Record<SignedInCaller, { id: string; email: string }>;
  offerId: string;
  claimId: string;
  donorOrganisationId: string;
  recipientOrganisationId: string;
  pendingOrganisationId: string;
  collectionId: string;
  /** donor confirmed, recipient has not */
  awaitingReceiptOfferId: string;
  /** received as a problem and not yet resolved, with a donor photo */
  handoverId: string;
  certificateId: string;
  inbox: Record<SignedInCaller, string>;
}

interface Cell {
  path: string;
  body?: unknown;
}

/** the contract's `RouteKey` pairs every method with every path, so the keys are built per route */
type MatrixKey = Route extends infer R
  ? R extends { method: infer M extends string; path: infer P extends string }
    ? `${M} ${P}`
    : never
  : never;

/** `todo` until the route is built */
type Row = 'todo' | ((world: World, caller: Caller) => Cell);

/** set for a release, where a built route still marked `todo` fails instead of being skipped */
const STRICT = process.env.DENIAL_MATRIX_STRICT === '1';

const ANY_ID = '0123456789abcdef01234567';
const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_PERIOD = { periodStart: '2020-01-01', periodEnd: TODAY };
const REPORT_RANGE = `from=${REPORT_PERIOD.periodStart}&to=${TODAY}`;

const OFFER_VIEW: Record<Caller, string> = {
  anonymous: 'all',
  donor: 'mine',
  otherDonor: 'mine',
  recipient: 'feed',
  otherRecipient: 'feed',
  coordinator: 'all',
  administrator: 'all',
};

let pushCount = 0;
function pushEndpoint() {
  pushCount += 1;
  return `https://push.example.org/subscriptions/${pushCount}`;
}

function offerForm() {
  const form = new FormData();
  form.append('title', '62 loaves and 40 rolls');
  form.append('category', 'bakery');
  form.append('offeredQuantityKg', '31');
  form.append('coldChain', 'ambient');
  form.append('collectionDeadline', new Date(Date.now() + 4 * HOUR).toISOString());
  return form;
}

const MATRIX = {
  'GET /api/health': () => ({ path: '/api/health' }),
  'GET /api/auth/csrf': () => ({ path: '/api/auth/csrf' }),
  'POST /api/auth/register': () => ({ path: '/api/auth/register', body: donorRegistration() }),
  'POST /api/auth/login': (w) => ({
    path: '/api/auth/login',
    body: { email: w.users.donor.email, password: TEST_PASSWORD },
  }),
  'POST /api/auth/logout': () => ({ path: '/api/auth/logout' }),
  'GET /api/me': () => ({ path: '/api/me' }),
  'PATCH /api/me': () => ({ path: '/api/me', body: { languagePreference: 'af' } }),
  'POST /api/me/password': () => ({
    path: '/api/me/password',
    body: { currentPassword: TEST_PASSWORD, newPassword: 'a different passphrase' },
  }),
  'POST /api/me/push-subscriptions': () => ({
    path: '/api/me/push-subscriptions',
    body: { endpoint: pushEndpoint(), keys: { p256dh: 'p256dh-key', auth: 'auth-key' } },
  }),
  'DELETE /api/me/push-subscriptions': () => ({
    path: '/api/me/push-subscriptions',
    body: { endpoint: pushEndpoint() },
  }),
  'GET /api/push/public-key': () => ({ path: '/api/push/public-key' }),

  'GET /api/organisations/me': () => ({ path: '/api/organisations/me' }),
  // valid for both the donor and the recipient schema
  'PATCH /api/organisations/me': () => ({
    path: '/api/organisations/me',
    body: { contactName: 'New Contact' },
  }),
  'GET /api/organisations': () => ({ path: '/api/organisations?type=recipient' }),
  'GET /api/organisations/:id': (w) => ({
    path: `/api/organisations/${w.recipientOrganisationId}`,
  }),
  'POST /api/organisations/:id/verification': (w) => ({
    path: `/api/organisations/${w.pendingOrganisationId}/verification`,
    body: { decision: 'verify' },
  }),
  'PUT /api/organisations/:id/notes': (w) => ({
    path: `/api/organisations/${w.recipientOrganisationId}/notes`,
    body: { capacityNotes: 'Two chest freezers' },
  }),

  'POST /api/offers': () => ({ path: '/api/offers', body: offerForm() }),
  'GET /api/offers': (_w, caller) => ({ path: `/api/offers?view=${OFFER_VIEW[caller]}` }),
  'GET /api/offers/:id': (w) => ({ path: `/api/offers/${w.offerId}` }),
  'POST /api/offers/:id/cancel': (w) => ({ path: `/api/offers/${w.offerId}/cancel`, body: {} }),
  'POST /api/offers/:id/claim': (w) => ({
    path: `/api/offers/${w.offerId}/claim`,
    body: { transportNeeded: false },
  }),
  'GET /api/claims': () => ({ path: '/api/claims' }),
  'POST /api/claims/:id/release': (w) => ({ path: `/api/claims/${w.claimId}/release`, body: {} }),
  'POST /api/claims/:id/override': 'todo',

  'POST /api/claims/:id/collection': (w) => ({
    path: `/api/claims/${w.claimId}/collection`,
    body: { driverName: 'Themba Nkosi', driverPhone: '+27821112222', scheduledFor: inHours(2) },
  }),
  'PATCH /api/collections/:id': (w) => ({
    path: `/api/collections/${w.collectionId}`,
    body: { status: 'completed' },
  }),
  'POST /api/offers/:id/handover/donor-confirm': (w) => {
    const form = new FormData();
    form.append('collectedQuantityKg', '10');
    return { path: `/api/offers/${w.offerId}/handover/donor-confirm`, body: form };
  },
  'POST /api/offers/:id/handover/recipient-confirm': (w) => ({
    path: `/api/offers/${w.awaitingReceiptOfferId}/handover/recipient-confirm`,
    body: { conditionOnReceipt: 'good' },
  }),
  'GET /api/handovers': () => ({ path: '/api/handovers' }),
  'POST /api/handovers/:id/resolution': (w) => ({
    path: `/api/handovers/${w.handoverId}/resolution`,
    body: { resolutionNote: 'Replaced the stock' },
  }),
  'GET /api/handovers/:id/photo': (w) => ({ path: `/api/handovers/${w.handoverId}/photo` }),

  'GET /api/notifications': () => ({ path: '/api/notifications' }),
  'POST /api/notifications/:id/read': (w, caller) => ({
    path: `/api/notifications/${caller === 'anonymous' ? ANY_ID : w.inbox[caller]}/read`,
  }),
  // no caller can sign these, so every cell is refused
  'POST /api/webhooks/twilio/inbound': () => ({
    path: '/api/webhooks/twilio/inbound',
    body: new URLSearchParams({ From: 'whatsapp:+27821234567', Body: 'YES' }),
  }),
  'POST /api/webhooks/twilio/status': () => ({
    path: '/api/webhooks/twilio/status',
    body: new URLSearchParams({ MessageSid: 'SM0123', MessageStatus: 'delivered' }),
  }),

  'GET /api/reports/impact': () => ({ path: `/api/reports/impact?${REPORT_RANGE}` }),
  'GET /api/reports/outcomes': () => ({ path: `/api/reports/outcomes?${REPORT_RANGE}` }),
  'GET /api/reports/export': () => ({ path: `/api/reports/export?${REPORT_RANGE}` }),
  'GET /api/valuation-rates': () => ({ path: '/api/valuation-rates' }),
  'PUT /api/valuation-rates': () => ({
    path: '/api/valuation-rates',
    body: { items: [{ category: 'dairy', ratePerKg: 18 }] },
  }),
  'POST /api/tax-certificates': (w) => ({
    path: '/api/tax-certificates',
    body: { donorOrganisationId: w.donorOrganisationId, ...REPORT_PERIOD },
  }),
  'GET /api/tax-certificates': () => ({ path: '/api/tax-certificates' }),
  'GET /api/tax-certificates/:id/pdf': (w) => ({
    path: `/api/tax-certificates/${w.certificateId}/pdf`,
  }),
  'GET /api/users': () => ({ path: '/api/users' }),
  'POST /api/users': () => ({
    path: '/api/users',
    body: {
      fullName: 'Thandi Mokoena',
      email: uniqueEmail('new-user'),
      role: 'coordinator',
      phone: '+27829998888',
      languagePreference: 'en',
    },
  }),
  'PATCH /api/users/:id': (w) => ({
    path: `/api/users/${w.users.otherRecipient.id}`,
    body: { status: 'disabled' },
  }),
  'GET /api/audit-log': () => ({ path: '/api/audit-log' }),
} satisfies Record<MatrixKey, Row>;

type Expected = 401 | 403 | 404 | 'allowed';

const DENIAL_CODE: Record<Exclude<Expected, 'allowed'>, ErrorCode> = {
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

/** read from the route's access rule, so the matrix and `routes.ts` cannot drift apart */
function expected(route: Route, caller: Caller): Expected {
  if (route.access === 'public') return 'allowed';
  if (route.access === 'twilio') return 403;
  if (caller === 'anonymous') return 401;
  if (route.access === 'any') return 'allowed';
  if (!(route.access as readonly Role[]).includes(ROLE[caller])) return 403;
  // a list is scoped to the caller's organisation instead, so only a single record can look missing
  if ('ownedByOrganisation' in route && route.path.includes(':id') && OUTSIDERS.has(caller)) {
    return 404;
  }
  return 'allowed';
}

let referenceCount = 0;

/** a second offer, its claim and the donor's confirmation. `received` adds a problem receipt and a photo */
async function handedOver(
  donorOrganisationId: Types.ObjectId,
  recipientOrganisationId: Types.ObjectId,
  users: World['users'],
  received: boolean,
) {
  referenceCount += 1;
  const offer = await OfferModel.create({
    donorOrganisationId,
    postedByUserId: users.donor.id,
    reference: `M${referenceCount.toString(36).toUpperCase().padStart(3, '0')}`,
    title: '40 litres of milk',
    description: null,
    category: 'dairy',
    offeredQuantityKg: 40,
    coldChain: 'refrigerated',
    photoUrls: [],
    availableFrom: new Date(Date.now() - 2 * HOUR),
    collectionDeadline: new Date(Date.now() + 3 * HOUR),
    status: received ? 'collected' : 'claimed',
  });
  const claim = await ClaimModel.create({
    offerId: offer._id,
    recipientOrganisationId,
    claimedByUserId: users.recipient.id,
    claimedAt: new Date(Date.now() - HOUR),
    transportNeeded: false,
    status: received ? 'fulfilled' : 'active',
  });
  const handover = await HandoverRecordModel.create({
    claimId: claim._id,
    offerId: offer._id,
    donorConfirmedByUserId: users.donor.id,
    donorConfirmedAt: new Date(Date.now() - HOUR / 2),
    donorPhotoUrl: received ? 'https://photos.example.org/milk.jpg' : null,
    collectedQuantityKg: 40,
    retainUntil: new Date(Date.now() + 700 * 24 * HOUR),
    ...(received && {
      recipientConfirmedByUserId: users.recipient.id,
      recipientConfirmedAt: new Date(),
      conditionOnReceipt: 'problem' as const,
      conditionNotes: 'Warm on arrival',
    }),
  });
  return { offerId: offer._id, handoverId: handover._id };
}

/** a fresh world per cell, so a cell that releases, cancels or signs out cannot change the next */
async function createWorld(): Promise<World> {
  const [donorOrg, otherDonorOrg, recipientOrg, otherRecipientOrg, pendingOrg] = await Promise.all([
    createOrganisation({ type: 'donor' }),
    createOrganisation({ type: 'donor', name: 'Kaap Foods' }),
    createOrganisation({ type: 'recipient', storageRefrigerated: true }),
    createOrganisation({ type: 'recipient', name: "St Michael's Night Shelter" }),
    createOrganisation({ type: 'recipient', status: 'pending', name: 'Langa Soup Kitchen' }),
  ]);

  const organisationOf: Record<SignedInCaller, Types.ObjectId | null> = {
    donor: donorOrg._id,
    recipient: recipientOrg._id,
    coordinator: null,
    administrator: null,
    otherDonor: otherDonorOrg._id,
    otherRecipient: otherRecipientOrg._id,
  };
  const signedIn = Object.keys(ROLE) as SignedInCaller[];
  const created = await Promise.all(
    signedIn.map((caller) =>
      createUser({ role: ROLE[caller], organisationId: organisationOf[caller] }),
    ),
  );
  const users = Object.fromEntries(
    signedIn.map((caller, i) => [caller, { id: created[i]!.id, email: created[i]!.email }]),
  ) as World['users'];

  referenceCount += 1;
  const offer = await OfferModel.create({
    donorOrganisationId: donorOrg._id,
    postedByUserId: users.donor.id,
    reference: `M${referenceCount.toString(36).toUpperCase().padStart(3, '0')}`,
    title: '40 litres of milk',
    description: null,
    category: 'dairy',
    offeredQuantityKg: 40,
    coldChain: 'refrigerated',
    photoUrls: [],
    availableFrom: new Date(Date.now() - HOUR),
    collectionDeadline: new Date(Date.now() + 3 * HOUR),
    status: 'claimed',
  });
  const claim = await ClaimModel.create({
    offerId: offer._id,
    recipientOrganisationId: recipientOrg._id,
    claimedByUserId: users.recipient.id,
    claimedAt: new Date(),
    transportNeeded: true,
    status: 'active',
  });
  const collection = await CollectionModel.create({
    claimId: claim._id,
    dispatchedByUserId: users.coordinator.id,
    driverName: 'Sipho Dube',
    driverPhone: '+27821110000',
    scheduledFor: new Date(Date.now() + HOUR),
  });
  const awaitingReceipt = await handedOver(donorOrg._id, recipientOrg._id, users, false);
  const received = await handedOver(donorOrg._id, recipientOrg._id, users, true);
  const certificate = await TaxCertificateModel.create({
    donorOrganisationId: donorOrg._id,
    periodStart: new Date('2020-01-01'),
    periodEnd: new Date(),
    handoverRecordIds: [received.handoverId],
    totalQuantityKg: 40,
    valuationByCategory: [{ category: 'dairy', quantityKg: 40, ratePerKg: 18, value: 720 }],
    totalValue: 720,
    certificateNumber: `TC-${referenceCount}-${Date.now()}`,
    donor: { name: donorOrg.name, addressLine: donorOrg.addressLine, suburb: donorOrg.suburb },
    placeholderRates: true,
  });

  const rows = await NotificationModel.create(
    signedIn.map((caller) => ({
      organisationId: organisationOf[caller],
      userId: users[caller].id,
      offerId: offer._id,
      kind: 'offer_posted' as const,
      channel: 'in_app' as const,
      title: 'New offer',
      body: '40 kg of milk in Woodstock',
    })),
  );
  const inbox = Object.fromEntries(
    signedIn.map((caller, i) => [caller, rows[i]!._id.toString()]),
  ) as World['inbox'];

  return {
    users,
    offerId: offer._id.toString(),
    claimId: claim._id.toString(),
    donorOrganisationId: donorOrg._id.toString(),
    recipientOrganisationId: recipientOrg._id.toString(),
    collectionId: collection._id.toString(),
    awaitingReceiptOfferId: awaitingReceipt.offerId.toString(),
    handoverId: received.handoverId.toString(),
    certificateId: certificate._id.toString(),
    pendingOrganisationId: pendingOrg._id.toString(),
    inbox,
  };
}

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  // a push key, so the public key route answers instead of reporting push as switched off
  const notifications = newNotificationService({ vapidPublicKey: 'test-vapid-public-key' });
  const app = await startTestApp([], newOfferService({ notifier: notifications }), notifications);
  closeApp = app.close;
  baseUrl = app.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

async function clientFor(world: World, caller: Caller) {
  return caller === 'anonymous'
    ? anonymousClient(baseUrl)
    : signedInClient(baseUrl, world.users[caller].email);
}

const isMutating = (route: Route) => route.method !== 'GET';
const withAnyId = (path: string) => path.replaceAll(':id', ANY_ID);

test('every route in the contract has a row', () => {
  const rows: Record<string, Row> = MATRIX;
  const missing = ROUTES.map(routeKey).filter((key) => !(key in rows));
  expect(missing).toEqual([]);
});

describe.each(ROUTES.map((route) => ({ key: routeKey(route), route })))(
  '$key',
  ({ key, route }) => {
    const row: Row = MATRIX[key as MatrixKey];

    if (row === 'todo') {
      if (!STRICT) {
        test.todo('needs a row once the route is built');
        return;
      }
      test('is not built yet', async () => {
        const client = await anonymousClient(baseUrl);
        const res = await client.request(route.method, withAnyId(route.path));
        expect(res.status, `${key} answers now, so its row needs filling in`).toBe(404);
      });
      return;
    }

    test.each(CALLERS)('%s', async (caller) => {
      const world = await createWorld();
      const cell = row(world, caller);
      const client = await clientFor(world, caller);

      const res = await client.request(route.method, cell.path, cell.body);
      const want = expected(route, caller);

      if (want === 'allowed') {
        // a conflict still means the guards let the caller through, as when cancelling a claimed offer
        expect(res.status < 400 || res.status === 409, `${res.status}: ${await res.text()}`).toBe(
          true,
        );
      } else {
        expect(res.status).toBe(want);
        expect(ErrorEnvelope.parse(await res.json()).error.code).toBe(DENIAL_CODE[want]);
      }
    });
  },
);

describe('CSRF', () => {
  // the token check runs before routing, so routes not built yet are covered too
  const mutating = ROUTES.filter((route) => isMutating(route) && route.access !== 'twilio');

  test.each(mutating.map((route) => ({ key: routeKey(route), route })))(
    '$key refuses a missing or wrong token',
    async ({ route }) => {
      const coordinator = await createUser({ role: 'coordinator' });
      const client = await signedInClient(baseUrl, coordinator.email);
      const path = withAnyId(route.path);

      client.csrfToken = '';
      const missing = await client.request(route.method, path, {});
      client.csrfToken = 'not-the-token';
      const wrong = await client.request(route.method, path, {});

      for (const res of [missing, wrong]) {
        expect(res.status).toBe(403);
        expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('CSRF_INVALID');
      }
    },
  );
});

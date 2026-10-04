import {
  ErrorEnvelope,
  OrganisationDetailResponse,
  OrganisationListResponse,
  OrganisationResponse,
  SessionResponse,
  suburbLocation,
  type RegisterRequest,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  HandoverRecordModel,
  OfferModel,
  OrganisationModel,
  runInTransaction,
} from '../../src/db/index.js';
import { canClaim } from '../../src/services/organisation-status.js';
import { TestClient } from '../test-client.js';
import {
  anonymousClient,
  createUser,
  donorRegistration,
  newOrganisationService,
  recipientRegistration,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let coordinator: TestClient;
let coordinatorId: Types.ObjectId;

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  closeApp = app.close;
  baseUrl = app.baseUrl;
  const user = await createUser({ role: 'coordinator' });
  coordinatorId = user._id;
  coordinator = await signedInClient(baseUrl, user.email);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

async function errorBody(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error;
}

/** registers through the API and returns the signed-in client with its organisation ID */
async function register(input: RegisterRequest) {
  const client = await anonymousClient(baseUrl);
  const res = await client.post('/api/auth/register', input);
  if (res.status !== 201) throw new Error(`registration failed with ${res.status}`);
  const body = SessionResponse.parse(await res.json());
  await client.fetchCsrfToken();
  return { client, organisationId: body.organisation!.id };
}

function decide(organisationId: string, decision: string, note?: string) {
  return coordinator.post(`/api/organisations/${organisationId}/verification`, { decision, note });
}

describe('own profile', () => {
  test('a recipient reads its own organisation, and staff and anonymous callers cannot', async () => {
    const { client, organisationId } = await register(recipientRegistration());
    const admin = await signedInClient(
      baseUrl,
      (await createUser({ role: 'administrator' })).email,
    );

    const res = await client.get('/api/organisations/me');

    expect(res.status).toBe(200);
    const body = OrganisationResponse.parse(await res.json());
    expect(body.organisation).toMatchObject({ id: organisationId, status: 'pending' });
    expect((await coordinator.get('/api/organisations/me')).status).toBe(403);
    expect((await admin.get('/api/organisations/me')).status).toBe(403);
    expect((await new TestClient(baseUrl).get('/api/organisations/me')).status).toBe(401);
  });

  test('a recipient edits its storage, capacity, transport and suburb, and its location follows', async () => {
    const { client, organisationId } = await register(recipientRegistration());

    const res = await client.request('PATCH', '/api/organisations/me', {
      storageRefrigerated: true,
      storageFrozen: true,
      maxCapacityKg: 80,
      hasTransport: true,
      suburb: 'Observatory',
    });

    expect(res.status).toBe(200);
    const body = OrganisationResponse.parse(await res.json());
    expect(body.organisation).toMatchObject({
      type: 'recipient',
      storageAmbient: true,
      storageRefrigerated: true,
      storageFrozen: true,
      maxCapacityKg: 80,
      hasTransport: true,
      suburb: 'Observatory',
      city: 'Cape Town',
      location: suburbLocation('Observatory'),
    });

    const stored = await OrganisationModel.findById(organisationId).lean();
    expect(stored!.suburb).toBe('Observatory');
    expect(stored!.location.coordinates).toEqual(suburbLocation('Observatory').coordinates);
    expect(stored!.location.coordinates).not.toEqual(suburbLocation('Khayelitsha').coordinates);
  });

  test('a recipient clears its capacity limit with null', async () => {
    const { client } = await register(recipientRegistration());
    await client.request('PATCH', '/api/organisations/me', { maxCapacityKg: 50 });

    const res = await client.request('PATCH', '/api/organisations/me', { maxCapacityKg: null });

    expect(OrganisationResponse.parse(await res.json()).organisation).toMatchObject({
      maxCapacityKg: null,
    });
  });

  test('a donor edits its contact details and tax reference', async () => {
    const { client, organisationId } = await register(donorRegistration());

    const res = await client.request('PATCH', '/api/organisations/me', {
      contactName: 'Zanele Mokoena',
      contactPhone: '+27829876543',
      contactEmail: 'Orders@Example.org',
      taxReferenceNumber: '9012345678',
    });

    expect(res.status).toBe(200);
    expect(OrganisationResponse.parse(await res.json()).organisation).toMatchObject({
      type: 'donor',
      contactName: 'Zanele Mokoena',
      contactPhone: '+27829876543',
      contactEmail: 'orders@example.org',
      taxReferenceNumber: '9012345678',
    });
    const stored = await OrganisationModel.findById(organisationId).lean();
    expect(stored!.taxReferenceNumber).toBe('9012345678');
  });

  test('a donor is refused a recipient-only field and nothing changes', async () => {
    const { client, organisationId } = await register(donorRegistration());

    const res = await client.request('PATCH', '/api/organisations/me', {
      contactName: 'Someone Else',
      storageRefrigerated: true,
    });

    expect(res.status).toBe(400);
    const error = await errorBody(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(error.fields)).toContain('storageRefrigerated');
    const stored = await OrganisationModel.findById(organisationId).lean();
    expect(stored!.contactName).toBe('Riaan de Villiers');
    expect(stored!.storageRefrigerated).toBeUndefined();
  });

  test('a recipient is refused the tax reference, and neither side can set its own status', async () => {
    const recipient = await register(recipientRegistration());
    const donor = await register(donorRegistration());

    const tax = await recipient.client.request('PATCH', '/api/organisations/me', {
      taxReferenceNumber: '9012345678',
    });
    const recipientStatus = await recipient.client.request('PATCH', '/api/organisations/me', {
      status: 'verified',
    });
    const donorNotes = await donor.client.request('PATCH', '/api/organisations/me', {
      capacityNotes: 'Trust us',
    });

    expect(tax.status).toBe(400);
    expect(recipientStatus.status).toBe(400);
    expect(donorNotes.status).toBe(400);
    const stored = await OrganisationModel.findById(recipient.organisationId).lean();
    expect(stored!.status).toBe('pending');
  });
});

describe('listing and detail', () => {
  test('staff filter organisations by type, status and search text', async () => {
    const { organisationId } = await register({
      ...recipientRegistration(),
      organisation: {
        ...recipientRegistration().organisation,
        name: "St Michael's Night Shelter",
      },
    } as RegisterRequest);
    const admin = await signedInClient(
      baseUrl,
      (await createUser({ role: 'administrator' })).email,
    );

    const res = await coordinator.get('/api/organisations?type=recipient&status=pending&q=michael');
    const asAdmin = await admin.get('/api/organisations?q=MICHAEL');
    const noMatch = await coordinator.get('/api/organisations?type=donor&q=michael');

    expect(res.status).toBe(200);
    const body = OrganisationListResponse.parse(await res.json());
    expect(body.items.map((o) => o.id)).toContain(organisationId);
    expect(body.total).toBe(body.items.length);
    expect(body.items.every((o) => o.type === 'recipient' && o.status === 'pending')).toBe(true);
    expect(OrganisationListResponse.parse(await asAdmin.json()).items.length).toBeGreaterThan(0);
    expect(OrganisationListResponse.parse(await noMatch.json()).total).toBe(0);
  });

  test('donors and recipients cannot list or open organisations', async () => {
    const { client, organisationId } = await register(recipientRegistration());
    const donor = await register(donorRegistration());

    expect((await client.get('/api/organisations')).status).toBe(403);
    expect((await donor.client.get('/api/organisations')).status).toBe(403);
    expect((await client.get(`/api/organisations/${organisationId}`)).status).toBe(403);
    expect((await new TestClient(baseUrl).get('/api/organisations')).status).toBe(401);
  });

  test('a missing organisation is not found and a malformed ID is refused', async () => {
    const missing = await coordinator.get(`/api/organisations/${new Types.ObjectId()}`);
    const malformed = await coordinator.get('/api/organisations/not-an-id');

    expect(missing.status).toBe(404);
    expect((await errorBody(missing)).code).toBe('NOT_FOUND');
    expect(malformed.status).toBe(400);
  });

  test("a recipient's stats count its claims and only dual-confirmed kilograms", async () => {
    const { organisationId } = await register(recipientRegistration());
    const recipientId = new Types.ObjectId(organisationId);
    const claim = (status: 'active' | 'released' | 'fulfilled') =>
      ClaimModel.create({
        offerId: new Types.ObjectId(),
        recipientOrganisationId: recipientId,
        claimedByUserId: new Types.ObjectId(),
        transportNeeded: false,
        status,
      });
    const fulfilled = await claim('fulfilled');
    const pendingHandover = await claim('active');
    await claim('released');
    const handover = (claimId: Types.ObjectId, kg: number, confirmed: boolean) =>
      HandoverRecordModel.create({
        claimId,
        offerId: new Types.ObjectId(),
        donorConfirmedByUserId: new Types.ObjectId(),
        donorConfirmedAt: new Date(),
        collectedQuantityKg: kg,
        recipientConfirmedAt: confirmed ? new Date() : null,
        retainUntil: new Date(Date.now() + 86_400_000),
      });
    await handover(fulfilled._id, 12.5, true);
    await handover(pendingHandover._id, 5, false);

    const res = await coordinator.get(`/api/organisations/${organisationId}`);

    expect(res.status).toBe(200);
    const body = OrganisationDetailResponse.parse(await res.json());
    expect(body.stats).toEqual({
      offersPosted: 0,
      claimsMade: 3,
      claimsReleased: 1,
      kgCollected: 12.5,
    });
  });

  test("a donor's stats count its offers and the kilograms collected from them", async () => {
    const { organisationId } = await register(donorRegistration());
    const offer = await OfferModel.create({
      donorOrganisationId: new Types.ObjectId(organisationId),
      postedByUserId: new Types.ObjectId(),
      reference: `T${Date.now().toString(36).slice(-6).toUpperCase()}`,
      title: 'Day-old bread',
      category: 'bakery',
      offeredQuantityKg: 20,
      coldChain: 'ambient',
      availableFrom: new Date(),
      collectionDeadline: new Date(Date.now() + 3_600_000),
      status: 'collected',
    });
    await HandoverRecordModel.create({
      claimId: new Types.ObjectId(),
      offerId: offer._id,
      donorConfirmedByUserId: new Types.ObjectId(),
      donorConfirmedAt: new Date(),
      collectedQuantityKg: 18,
      recipientConfirmedAt: new Date(),
      retainUntil: new Date(Date.now() + 86_400_000),
    });

    const body = OrganisationDetailResponse.parse(
      await (await coordinator.get(`/api/organisations/${organisationId}`)).json(),
    );

    expect(body.stats).toEqual({
      offersPosted: 1,
      claimsMade: 0,
      claimsReleased: 0,
      kgCollected: 18,
    });
  });
});

describe('verification', () => {
  test('verifying a pending recipient lets it claim and records who decided and when', async () => {
    const { organisationId } = await register(recipientRegistration());
    expect(canClaim((await OrganisationModel.findById(organisationId).lean())!)).toBe(false);

    const res = await decide(organisationId, 'verify', 'Visited on Tuesday, kitchen is clean');

    expect(res.status).toBe(200);
    const body = OrganisationResponse.parse(await res.json());
    expect(body.organisation.status).toBe('verified');
    expect(body.organisation.verifiedAt).not.toBeNull();

    const stored = await OrganisationModel.findById(organisationId).lean();
    expect(stored!.verifiedByUserId).toEqual(coordinatorId);
    expect(stored!.verifiedAt).toBeInstanceOf(Date);
    expect(canClaim(stored!)).toBe(true);

    const entries = await AuditLogModel.find({ targetId: stored!._id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      userId: coordinatorId,
      action: 'verify_organisation',
      targetType: 'organisations',
      note: 'Visited on Tuesday, kitchen is clean',
    });
    expect(entries[0]!.at).toBeInstanceOf(Date);
  });

  test('each decision is audited with its own action', async () => {
    const rejected = await register(recipientRegistration());
    const suspended = await register(recipientRegistration());

    expect(
      (await decide(rejected.organisationId, 'reject', 'No food safety certificate')).status,
    ).toBe(200);
    expect((await decide(rejected.organisationId, 'verify', 'Certificate supplied')).status).toBe(
      200,
    );
    expect((await decide(suspended.organisationId, 'verify')).status).toBe(200);
    expect((await decide(suspended.organisationId, 'suspend', 'Three no-shows')).status).toBe(200);
    const reinstated = await decide(suspended.organisationId, 'reinstate');

    expect(OrganisationResponse.parse(await reinstated.json()).organisation.status).toBe(
      'verified',
    );
    const actions = async (id: string) =>
      (await AuditLogModel.find({ targetId: id }).sort({ at: 1, _id: 1 }).lean()).map(
        (e) => e.action,
      );
    expect(await actions(rejected.organisationId)).toEqual([
      'reject_organisation',
      'verify_organisation',
    ]);
    expect(await actions(suspended.organisationId)).toEqual([
      'verify_organisation',
      'suspend_organisation',
      'reinstate_organisation',
    ]);
  });

  test('reinstating an organisation with a fulfilled claim makes it active', async () => {
    const { organisationId } = await register(recipientRegistration());
    await decide(organisationId, 'verify');
    await ClaimModel.create({
      offerId: new Types.ObjectId(),
      recipientOrganisationId: new Types.ObjectId(organisationId),
      claimedByUserId: new Types.ObjectId(),
      transportNeeded: false,
      status: 'fulfilled',
    });
    await decide(organisationId, 'suspend');

    const res = await decide(organisationId, 'reinstate');

    expect(OrganisationResponse.parse(await res.json()).organisation.status).toBe('active');
  });

  test('a transition outside the table is refused and nothing is recorded', async () => {
    const { organisationId } = await register(recipientRegistration());
    await decide(organisationId, 'verify');

    const again = await decide(organisationId, 'verify');
    const reject = await decide(organisationId, 'reject');

    expect(again.status).toBe(409);
    expect((await errorBody(again)).code).toBe('INVALID_STATE');
    expect(reject.status).toBe(409);
    expect((await OrganisationModel.findById(organisationId).lean())!.status).toBe('verified');
    expect(await AuditLogModel.countDocuments({ targetId: organisationId })).toBe(1);
  });

  test('a donor organisation never goes through verification', async () => {
    const { organisationId } = await register(donorRegistration());

    const res = await decide(organisationId, 'suspend');

    expect(res.status).toBe(409);
    expect((await errorBody(res)).code).toBe('INVALID_STATE');
    expect((await OrganisationModel.findById(organisationId).lean())!.status).toBe('active');
  });

  test('only a coordinator can make a verification decision', async () => {
    const recipient = await register(recipientRegistration());
    const admin = await signedInClient(
      baseUrl,
      (await createUser({ role: 'administrator' })).email,
    );
    const path = `/api/organisations/${recipient.organisationId}/verification`;

    const asAdmin = await admin.post(path, { decision: 'verify' });
    const asSelf = await recipient.client.post(path, { decision: 'verify' });
    const anonymous = await (await anonymousClient(baseUrl)).post(path, { decision: 'verify' });

    expect(asAdmin.status).toBe(403);
    expect((await errorBody(asAdmin)).code).toBe('FORBIDDEN');
    expect(asSelf.status).toBe(403);
    expect(anonymous.status).toBe(401);
    expect((await OrganisationModel.findById(recipient.organisationId).lean())!.status).toBe(
      'pending',
    );
  });

  test('an unknown decision is refused and an unknown organisation is not found', async () => {
    const { organisationId } = await register(recipientRegistration());

    const unknown = await decide(organisationId, 'approve');
    const missing = await decide(new Types.ObjectId().toString(), 'verify');

    expect(unknown.status).toBe(400);
    expect(missing.status).toBe(404);
  });
});

describe('first fulfilment', () => {
  const organisations = newOrganisationService();

  async function statusAfterFulfilment(status: string) {
    const { organisationId } = await register(recipientRegistration());
    await OrganisationModel.updateOne({ _id: organisationId }, { $set: { status } });
    await runInTransaction((session) =>
      organisations.recordFirstFulfilment(organisationId, session),
    );
    return (await OrganisationModel.findById(organisationId).lean())!.status;
  }

  test('a verified recipient becomes active', async () => {
    expect(await statusAfterFulfilment('verified')).toBe('active');
  });

  test('an active or suspended recipient is left as it is', async () => {
    expect(await statusAfterFulfilment('active')).toBe('active');
    expect(await statusAfterFulfilment('suspended')).toBe('suspended');
  });
});

describe('capacity notes', () => {
  const notes = 'Fridge fits about 40 kg. Closed on Sundays, ask for Brother Peter';

  test('a coordinator replaces the notes and the change is audited', async () => {
    const { organisationId } = await register(recipientRegistration());
    const path = `/api/organisations/${organisationId}/notes`;
    await coordinator.request('PUT', path, { capacityNotes: 'First draft' });

    const res = await coordinator.request('PUT', path, { capacityNotes: notes });

    expect(res.status).toBe(200);
    expect(OrganisationResponse.parse(await res.json()).organisation.capacityNotes).toBe(notes);
    const detail = OrganisationDetailResponse.parse(
      await (await coordinator.get(`/api/organisations/${organisationId}`)).json(),
    );
    expect(detail.organisation.capacityNotes).toBe(notes);

    const entries = await AuditLogModel.find({
      targetId: organisationId,
      action: 'update_capacity_notes',
    }).lean();
    expect(entries).toHaveLength(2);
    expect(entries[0]!.userId).toEqual(coordinatorId);
  });

  test('the notes never reach the organisation itself', async () => {
    const { client, organisationId } = await register(recipientRegistration());
    await coordinator.request('PUT', `/api/organisations/${organisationId}/notes`, {
      capacityNotes: notes,
    });

    const own = await (await client.get('/api/organisations/me')).text();
    const me = await (await client.get('/api/me')).text();
    const patched = await (
      await client.request('PATCH', '/api/organisations/me', { hasTransport: true })
    ).text();

    for (const text of [own, me, patched]) {
      expect(text).not.toContain('capacityNotes');
      expect(text).not.toContain('Brother Peter');
    }
  });

  test('only a coordinator can replace the notes', async () => {
    const recipient = await register(recipientRegistration());
    const admin = await signedInClient(
      baseUrl,
      (await createUser({ role: 'administrator' })).email,
    );
    const path = `/api/organisations/${recipient.organisationId}/notes`;

    expect((await admin.request('PUT', path, { capacityNotes: notes })).status).toBe(403);
    expect((await recipient.client.request('PUT', path, { capacityNotes: notes })).status).toBe(
      403,
    );
    expect(
      (
        await coordinator.request('PUT', `/api/organisations/${new Types.ObjectId()}/notes`, {
          capacityNotes: notes,
        })
      ).status,
    ).toBe(404);
    expect((await OrganisationModel.findById(recipient.organisationId).lean())!.capacityNotes).toBe(
      '',
    );
  });
});

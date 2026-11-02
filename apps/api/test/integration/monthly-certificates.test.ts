import { ErrorEnvelope, FoodCategory, SCHEDULER_EMAIL } from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  HandoverRecordModel,
  NotificationModel,
  OfferModel,
  OrganisationModel,
  OrganisationRepository,
  TaxCertificateModel,
  TaxCertificateRepository,
  UserModel,
  UserRepository,
  ValuationRateModel,
} from '../../src/db/index.js';
import {
  MonthlyCertificateService,
  type MonthlySummary,
} from '../../src/services/monthly-certificates.js';
import { findOrCreateScheduler } from '../../src/services/scheduler-account.js';
import {
  anonymousClient,
  createOrganisation,
  createUser,
  newNotificationService,
  newReportingService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

type Organisation = Awaited<ReturnType<typeof createOrganisation>>;

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let recipient: Organisation;
let referenceCount = 0;

const sa = (local: string) => new Date(`${local}+02:00`);
const HOUR = 60 * 60 * 1000;

const PLACEHOLDERS: Record<FoodCategory, number> = {
  bakery: 22,
  produce: 14,
  dairy: 12.99,
  prepared: 45,
  dry: 26,
  other: 20,
};

function newService() {
  return new MonthlyCertificateService(
    newReportingService(),
    new OrganisationRepository(),
    new TaxCertificateRepository(),
    new UserRepository(),
    newNotificationService(),
  );
}

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  baseUrl = app.baseUrl;
  closeApp = app.close;
  await ValuationRateModel.create(
    FoodCategory.options.map((category) => ({ category, ratePerKg: PLACEHOLDERS[category] })),
  );
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

beforeEach(async () => {
  await Promise.all([
    AuditLogModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    HandoverRecordModel.deleteMany({}),
    NotificationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    OrganisationModel.deleteMany({}),
    TaxCertificateModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
  recipient = await createOrganisation({ type: 'recipient' });
});

async function donation(donor: Organisation, category: FoodCategory, kg: number, confirmed: Date) {
  referenceCount += 1;
  const donorConfirmedAt = new Date(confirmed.getTime() - HOUR / 4);
  const postedAt = new Date(donorConfirmedAt.getTime() - 2 * HOUR);
  const offer = await OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: new Types.ObjectId(),
    reference: `M${referenceCount.toString().padStart(3, '0')}`,
    title: 'Fixture offer',
    category,
    offeredQuantityKg: kg,
    coldChain: 'ambient',
    availableFrom: postedAt,
    collectionDeadline: new Date(postedAt.getTime() + 6 * HOUR),
    status: 'collected',
    createdAt: postedAt,
  });
  const claim = await ClaimModel.create({
    offerId: offer._id,
    recipientOrganisationId: recipient._id,
    claimedByUserId: new Types.ObjectId(),
    claimedAt: new Date(postedAt.getTime() + HOUR / 2),
    transportNeeded: false,
    status: 'fulfilled',
  });
  return HandoverRecordModel.create({
    claimId: claim._id,
    offerId: offer._id,
    donorConfirmedByUserId: new Types.ObjectId(),
    donorConfirmedAt,
    collectedQuantityKg: kg,
    recipientConfirmedByUserId: new Types.ObjectId(),
    recipientConfirmedAt: confirmed,
    conditionOnReceipt: 'good',
    retainUntil: new Date(donorConfirmedAt.getTime() + 730 * 24 * HOUR),
  });
}

const ids = (rows: { donorOrganisationId: string }[]) => rows.map((r) => r.donorOrganisationId);

describe('a monthly run', () => {
  test('a second run for the same month issues nothing', async () => {
    const bakery = await createOrganisation({ type: 'donor', name: 'Bakery' });
    const farm = await createOrganisation({ type: 'donor', name: 'Farm' });
    const empty = await createOrganisation({ type: 'donor', name: 'Empty' });
    await donation(bakery, 'bakery', 10, sa('2026-09-05T10:00:00'));
    await donation(farm, 'produce', 20, sa('2026-09-20T10:00:00'));
    const service = newService();

    const first = await service.issueForMonth('2026-09');
    const second = await service.issueForMonth('2026-09');

    expect(ids(first.issued).sort()).toEqual([bakery.id, farm.id].sort());
    expect(ids(first.skipped)).toEqual([empty.id]);
    expect(first.skipped[0]!.reason).toBe('nothing to certify');
    expect(first.failed).toEqual([]);
    expect(second.issued).toEqual([]);
    expect(ids(second.skipped).sort()).toEqual([bakery.id, farm.id, empty.id].sort());
    expect(second.skipped.find((s) => s.donorOrganisationId === bakery.id)!.reason).toBe(
      'already issued for this month',
    );
    expect(await TaxCertificateModel.countDocuments({ donorOrganisationId: bakery._id })).toBe(1);
    expect(await TaxCertificateModel.countDocuments({ donorOrganisationId: farm._id })).toBe(1);
    expect(await TaxCertificateModel.countDocuments({ donorOrganisationId: empty._id })).toBe(0);
  });

  test('each certificate is recorded under one disabled scheduler account', async () => {
    const bakery = await createOrganisation({ type: 'donor', name: 'Bakery' });
    const farm = await createOrganisation({ type: 'donor', name: 'Farm' });
    await donation(bakery, 'bakery', 10, sa('2026-09-05T10:00:00'));
    await donation(farm, 'produce', 20, sa('2026-09-20T10:00:00'));
    const service = newService();

    await service.issueForMonth('2026-09');
    await service.issueForMonth('2026-09');

    const schedulers = await UserModel.find({ email: SCHEDULER_EMAIL });
    expect(schedulers).toHaveLength(1);
    const scheduler = schedulers[0]!;
    expect(scheduler.role).toBe('administrator');
    expect(scheduler.status).toBe('disabled');
    expect(scheduler.organisationId).toBeNull();

    const certificates = await TaxCertificateModel.find({});
    expect(certificates).toHaveLength(2);
    for (const certificate of certificates) {
      const rows = await AuditLogModel.find({
        action: 'issue_certificate',
        targetId: certificate._id,
      });
      expect(rows).toHaveLength(1);
      expect(String(rows[0]!.userId)).toBe(scheduler.id);
    }
  });

  test('two runs at once create one scheduler account', async () => {
    const bakery = await createOrganisation({ type: 'donor', name: 'Bakery' });
    await donation(bakery, 'bakery', 10, sa('2026-08-05T10:00:00'));

    await Promise.all([
      newService().issueForMonth('2026-08'),
      newService().issueForMonth('2026-08'),
    ]);

    expect(await UserModel.countDocuments({ email: SCHEDULER_EMAIL })).toBe(1);
    expect(await TaxCertificateModel.countDocuments({ donorOrganisationId: bakery._id })).toBe(1);
  });

  test('asking for the scheduler twice at once returns the same account', async () => {
    const users = new UserRepository();

    const [a, b] = await Promise.all([findOrCreateScheduler(users), findOrCreateScheduler(users)]);

    expect(a.id).toBe(b.id);
    expect(await UserModel.countDocuments({ email: SCHEDULER_EMAIL })).toBe(1);
  });

  test('every active donor user gets one inbox notification and a disabled user gets none', async () => {
    const bakery = await createOrganisation({ type: 'donor', name: 'Bakery' });
    const first = await createUser({ role: 'donor', organisationId: bakery._id });
    const second = await createUser({ role: 'donor', organisationId: bakery._id });
    const disabled = await createUser({
      role: 'donor',
      organisationId: bakery._id,
      status: 'disabled',
    });
    await donation(bakery, 'bakery', 10, sa('2026-09-05T10:00:00'));

    await newService().issueForMonth('2026-09');

    for (const user of [first, second]) {
      const rows = await NotificationModel.find({ userId: user._id, channel: 'in_app' });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.kind).toBe('certificate_issued');
      expect(rows[0]!.href).toBe('/donor/certificates');
    }
    expect(await NotificationModel.countDocuments({ userId: disabled._id })).toBe(0);
  });

  test('a donor with a missing valuation rate fails and the others are issued', async () => {
    const bakery = await createOrganisation({ type: 'donor', name: 'Bakery' });
    const odd = await createOrganisation({ type: 'donor', name: 'Odd jobs' });
    await donation(bakery, 'bakery', 10, sa('2026-09-05T10:00:00'));
    await donation(odd, 'other', 5, sa('2026-09-06T10:00:00'));

    let summary: MonthlySummary;
    await ValuationRateModel.findOneAndDelete({ category: 'other' });
    try {
      summary = await newService().issueForMonth('2026-09');
    } finally {
      await ValuationRateModel.create({ category: 'other', ratePerKg: PLACEHOLDERS.other });
    }

    expect(ids(summary.issued)).toEqual([bakery.id]);
    expect(summary.failed).toEqual([
      { donorOrganisationId: odd.id, reason: 'Set a valuation rate for other first' },
    ]);
    expect(await TaxCertificateModel.countDocuments({ donorOrganisationId: odd._id })).toBe(0);
  });

  test('a handover at 23:30 on the last day is in the month and one at 00:30 on the 1st is not', async () => {
    const bakery = await createOrganisation({ type: 'donor', name: 'Bakery' });
    const before = await donation(bakery, 'bakery', 10, sa('2026-08-31T23:30:00'));
    const inside = await donation(bakery, 'bakery', 10, sa('2026-09-30T23:30:00'));
    const after = await donation(bakery, 'bakery', 10, sa('2026-10-01T00:30:00'));

    await newService().issueForMonth('2026-09');

    const certificate = await TaxCertificateModel.findOne({ donorOrganisationId: bakery._id });
    const included = certificate!.handoverRecordIds.map(String);
    expect(included).toEqual([inside.id]);
    expect(included).not.toContain(before.id);
    expect(included).not.toContain(after.id);
  });
});

describe('the scheduler account', () => {
  test('cannot sign in, even if it were made active', async () => {
    await findOrCreateScheduler(new UserRepository());

    const disabled = await (
      await anonymousClient(baseUrl)
    ).post('/api/auth/login', {
      email: SCHEDULER_EMAIL,
      password: 'any password at all',
    });
    expect(disabled.status).toBe(401);
    expect(ErrorEnvelope.parse(await disabled.json()).error.code).toBe('UNAUTHENTICATED');

    await UserModel.updateOne({ email: SCHEDULER_EMAIL }, { $set: { status: 'active' } });
    const active = await (
      await anonymousClient(baseUrl)
    ).post('/api/auth/login', {
      email: SCHEDULER_EMAIL,
      password: 'a guessed password',
    });
    expect(active.status).toBe(401);
    expect(ErrorEnvelope.parse(await active.json()).error.code).toBe('UNAUTHENTICATED');
  });

  test('cannot be reset, and cannot sign in even with its password', async () => {
    const scheduler = await findOrCreateScheduler(new UserRepository());
    const admin = await createUser({ role: 'administrator' });
    const adminClient = await signedInClient(baseUrl, admin.email);
    await UserModel.updateOne(
      { email: SCHEDULER_EMAIL },
      { $set: { status: 'active', passwordHash: admin.passwordHash } },
    );

    const reset = await adminClient.post(`/api/users/${scheduler.id}/password-reset`, {});
    expect(reset.status).toBe(409);
    expect(ErrorEnvelope.parse(await reset.json()).error.code).toBe('INVALID_STATE');
    expect(await AuditLogModel.countDocuments({ targetId: scheduler._id })).toBe(0);

    await expect(signedInClient(baseUrl, SCHEDULER_EMAIL)).rejects.toThrow('401');
  });
});

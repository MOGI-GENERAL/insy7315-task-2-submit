import {
  ErrorEnvelope,
  ImpactResponse,
  OutcomesResponse,
  type ClaimStatus,
  type FoodCategory,
  type OfferStatus,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  ClaimModel,
  HandoverRecordModel,
  OfferModel,
  OrganisationModel,
  TaxCertificateModel,
  UserModel,
} from '../../src/db/index.js';
import { roundKg } from '../../src/services/meals.js';
import { TestClient } from '../test-client.js';
import {
  createOrganisation,
  createUser,
  newReportingService,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

type Organisation = Awaited<ReturnType<typeof createOrganisation>>;
type Offer = { _id: Types.ObjectId; createdAt: Date };

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let admin: TestClient;

/** a wall-clock time in Cape Town */
const sa = (local: string) => new Date(`${local}+02:00`);

const HOUR = 60 * 60 * 1000;

let referenceCount = 0;

async function postOffer(fields: {
  donor: Organisation;
  postedAt: Date;
  kg: number;
  status: OfferStatus;
  parent?: Offer;
  category?: FoodCategory;
}) {
  referenceCount += 1;
  const deadline = new Date(fields.postedAt.getTime() + 6 * HOUR);
  return OfferModel.create({
    donorOrganisationId: fields.donor._id,
    postedByUserId: new Types.ObjectId(),
    reference: `R${referenceCount.toString().padStart(3, '0')}`,
    title: 'Fixture offer',
    category: fields.category ?? 'bakery',
    offeredQuantityKg: fields.kg,
    coldChain: 'ambient',
    availableFrom: fields.postedAt,
    collectionDeadline: deadline,
    status: fields.status,
    expiredAt: fields.status === 'expired' ? deadline : null,
    parentOfferId: fields.parent?._id ?? null,
    createdAt: fields.postedAt,
  });
}

function claim(offer: Offer, recipient: Organisation, status: ClaimStatus) {
  const claimedAt = new Date(offer.createdAt.getTime() + HOUR / 2);
  return ClaimModel.create({
    offerId: offer._id,
    recipientOrganisationId: recipient._id,
    claimedByUserId: new Types.ObjectId(),
    claimedAt,
    transportNeeded: false,
    status,
    releasedAt: status === 'released' ? new Date(claimedAt.getTime() + HOUR / 2) : null,
  });
}

/** `recipientConfirmedAt` is null while only the donor has confirmed */
async function handover(
  offer: Offer,
  claimId: Types.ObjectId,
  kg: number,
  donorConfirmedAt: Date,
  recipientConfirmedAt: Date | null,
) {
  return HandoverRecordModel.create({
    claimId,
    offerId: offer._id,
    donorConfirmedByUserId: new Types.ObjectId(),
    donorConfirmedAt,
    collectedQuantityKg: kg,
    recipientConfirmedByUserId: recipientConfirmedAt ? new Types.ObjectId() : null,
    recipientConfirmedAt,
    conditionOnReceipt: recipientConfirmedAt ? 'good' : null,
    retainUntil: new Date(donorConfirmedAt.getTime() + 730 * 24 * HOUR),
  });
}

/** a fulfilled claim and a handover both sides confirmed */
async function collect(offer: Offer, recipient: Organisation, kg: number, confirmedAt: Date) {
  const fulfilled = await claim(offer, recipient, 'fulfilled');
  await handover(offer, fulfilled._id, kg, new Date(confirmedAt.getTime() - HOUR / 4), confirmedAt);
}

const ids = {} as Record<'ouma' | 'harbour' | 'siyakhula' | 'bonteheuwel', string>;

/**
 * offers A to N, with the October figures worked out by hand in the tests below.
 * B is the remainder of A and C the remainder of B
 */
async function createFixture() {
  const ouma = await createOrganisation({ type: 'donor', name: "Ouma's Bakery" });
  const harbour = await createOrganisation({ type: 'donor', name: 'Harbour Hotel' });
  const siyakhula = await createOrganisation({ type: 'recipient', name: 'Siyakhula Shelter' });
  const bonteheuwel = await createOrganisation({
    type: 'recipient',
    name: 'Bonteheuwel Soup Kitchen',
  });
  const stMichaels = await createOrganisation({ type: 'recipient', name: "St Michael's" });
  const hopeHouse = await createOrganisation({ type: 'recipient', name: 'Hope House' });
  ids.ouma = ouma.id;
  ids.harbour = harbour.id;
  ids.siyakhula = siyakhula.id;
  ids.bonteheuwel = bonteheuwel.id;

  // A: 30 kg offered and 20 kg collected. the 10 kg remainder becomes B
  const a = await postOffer({
    donor: ouma,
    postedAt: sa('2026-10-02T08:00:00'),
    kg: 30,
    status: 'collected',
  });
  await collect(a, siyakhula, 20, sa('2026-10-02T10:30:00'));
  const b = await postOffer({
    donor: ouma,
    postedAt: sa('2026-10-02T10:15:00'),
    kg: 10,
    status: 'collected',
    parent: a,
  });
  await collect(b, bonteheuwel, 7.5, sa('2026-10-03T09:00:00'));
  // C: the last 2.5 kg, which nobody claimed
  await postOffer({
    donor: ouma,
    postedAt: sa('2026-10-03T08:45:00'),
    kg: 2.5,
    status: 'expired',
    parent: b,
  });

  // D: expired while claimed, a collection failure
  const d = await postOffer({
    donor: harbour,
    postedAt: sa('2026-10-05T12:00:00'),
    kg: 12.3,
    status: 'expired',
  });
  await claim(d, hopeHouse, 'expired');

  // E: claimed and released, then expired while open. a matching failure
  const e = await postOffer({
    donor: harbour,
    postedAt: sa('2026-10-06T09:00:00'),
    kg: 8,
    status: 'expired',
  });
  await claim(e, stMichaels, 'released');

  await postOffer({
    donor: ouma,
    postedAt: sa('2026-10-07T09:00:00'),
    kg: 5,
    status: 'cancelled',
  });

  // G: released and open again
  const g = await postOffer({
    donor: ouma,
    postedAt: sa('2026-10-08T09:00:00'),
    kg: 6,
    status: 'open',
  });
  await claim(g, bonteheuwel, 'released');

  // H: the donor has confirmed and the recipient has not
  const h = await postOffer({
    donor: harbour,
    postedAt: sa('2026-10-09T09:00:00'),
    kg: 4,
    status: 'claimed',
  });
  const active = await claim(h, hopeHouse, 'active');
  await handover(h, active._id, 4, sa('2026-10-09T11:00:00'), null);

  // I: posted and confirmed just after midnight on 1 October, still 30 September in UTC
  const i = await postOffer({
    donor: harbour,
    postedAt: sa('2026-10-01T00:20:00'),
    kg: 15,
    status: 'collected',
  });
  await collect(i, bonteheuwel, 15, sa('2026-10-01T00:30:00'));

  // J: confirmed half an hour before midnight on 30 September
  const j = await postOffer({
    donor: ouma,
    postedAt: sa('2026-09-30T22:00:00'),
    kg: 9,
    status: 'collected',
  });
  await collect(j, stMichaels, 9, sa('2026-09-30T23:30:00'));

  // K: posted just after midnight on 1 November, still 31 October in UTC
  await postOffer({ donor: ouma, postedAt: sa('2026-11-01T00:10:00'), kg: 3, status: 'open' });

  // L: confirmed on 31 August, before every range here
  const l = await postOffer({
    donor: harbour,
    postedAt: sa('2026-08-31T18:00:00'),
    kg: 11,
    status: 'collected',
  });
  await collect(l, siyakhula, 11, sa('2026-08-31T23:30:00'));

  // M: posted on 31 October and confirmed on 1 November, still 31 October in UTC
  const m = await postOffer({
    donor: harbour,
    postedAt: sa('2026-10-31T20:00:00'),
    kg: 2,
    status: 'collected',
  });
  await collect(m, siyakhula, 2, sa('2026-11-01T00:05:00'));

  // N: confirmed in the last second of 31 October
  const n = await postOffer({
    donor: ouma,
    postedAt: sa('2026-10-31T21:00:00'),
    kg: 1.2,
    status: 'collected',
  });
  await collect(n, siyakhula, 1.2, sa('2026-10-31T23:59:59'));
}

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  closeApp = app.close;
  baseUrl = app.baseUrl;
  admin = await signedInClient(baseUrl, (await createUser({ role: 'administrator' })).email);
  await createFixture();
}, START_TIMEOUT_MS);

afterAll(async () => {
  await Promise.all([
    OrganisationModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    HandoverRecordModel.deleteMany({}),
    TaxCertificateModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
  await closeApp?.();
  await stopTestDb?.();
});

async function impact(query: string) {
  const res = await admin.get(`/api/reports/impact?${query}`);
  expect(res.status).toBe(200);
  return ImpactResponse.parse(await res.json());
}

async function outcomes(query: string) {
  const res = await admin.get(`/api/reports/outcomes?${query}`);
  expect(res.status).toBe(200);
  return OutcomesResponse.parse(await res.json());
}

describe('impact', () => {
  test('groups by month in South African time and leaves out handovers outside the range', async () => {
    const body = await impact('from=2026-09-01&to=2026-10-31&groupBy=month');

    expect(body).toEqual({
      rows: [
        // J
        { key: '2026-09', label: '2026-09', kg: 9, meals: 22 },
        // A 20 + B 7.5 + I 15 + N 1.2
        { key: '2026-10', label: '2026-10', kg: 43.7, meals: 109 },
      ],
      totals: { kg: 52.7, meals: 131 },
    });
  });

  test('groups by month by default', async () => {
    const body = await impact('from=2026-10-01&to=2026-10-31');

    expect(body.rows.map((row) => row.key)).toEqual(['2026-10']);
    expect(body.totals).toEqual({ kg: 43.7, meals: 109 });
  });

  test('groups by donor, with kilograms collected rather than offered', async () => {
    const body = await impact('from=2026-10-01&to=2026-10-31&groupBy=donor');

    expect(body).toEqual({
      rows: [
        // A 20 + B 7.5 + N 1.2. A offered 30 kg
        { key: ids.ouma, label: "Ouma's Bakery", kg: 28.7, meals: 71 },
        // I 15
        { key: ids.harbour, label: 'Harbour Hotel', kg: 15, meals: 37 },
      ],
      // 71 + 37 is 108, but 43.7 kg is 109 meals
      totals: { kg: 43.7, meals: 109 },
    });
  });

  test('groups by recipient', async () => {
    const body = await impact('from=2026-10-01&to=2026-10-31&groupBy=recipient');

    expect(body).toEqual({
      rows: [
        // B 7.5 + I 15
        { key: ids.bonteheuwel, label: 'Bonteheuwel Soup Kitchen', kg: 22.5, meals: 56 },
        // A 20 + N 1.2, where plain division gives 52
        { key: ids.siyakhula, label: 'Siyakhula Shelter', kg: 21.2, meals: 53 },
      ],
      totals: { kg: 43.7, meals: 109 },
    });
  });

  test('a one-day range includes the whole day at both ends', async () => {
    expect((await impact('from=2026-10-01&to=2026-10-01')).totals).toEqual({ kg: 15, meals: 37 });
    expect((await impact('from=2026-10-31&to=2026-10-31')).totals).toEqual({ kg: 1.2, meals: 3 });
    expect((await impact('from=2026-11-01&to=2026-11-01')).totals).toEqual({ kg: 2, meals: 5 });
  });

  test('a period with no handovers is empty', async () => {
    expect(await impact('from=2026-07-01&to=2026-07-31&groupBy=donor')).toEqual({
      rows: [],
      totals: { kg: 0, meals: 0 },
    });
  });
});

describe('outcomes', () => {
  test('counts each offer posted in the range once, remainders included', async () => {
    const body = await outcomes('from=2026-10-01&to=2026-10-31');

    expect(body).toEqual({
      // A to I, M and N. J, K and L were posted outside October in South African time
      posted: 11,
      // G
      open: 1,
      // H
      claimed: 1,
      // A, B, I, M, N
      collected: 5,
      // C, and E after its release
      expiredUnclaimed: 2,
      // D
      expiredClaimed: 1,
      // F
      cancelled: 1,
      // H, A, B, I, M, N and D are 7 of 11
      claimedPct: 63.6,
      // Siyakhula and Bonteheuwel. St Michael's fulfilled only J, in September
      distinctRecipients: 2,
    });
  });

  test('the counts add up to the offers posted', async () => {
    for (const query of [
      'from=2026-10-01&to=2026-10-31',
      'from=2026-08-01&to=2026-11-30',
      'from=2026-10-31&to=2026-11-01',
    ]) {
      const body = await outcomes(query);
      const total =
        body.open +
        body.claimed +
        body.collected +
        body.expiredUnclaimed +
        body.expiredClaimed +
        body.cancelled;
      expect(total).toBe(body.posted);
    }
  });

  test('takes the range in South African time at both ends', async () => {
    const body = await outcomes('from=2026-10-31&to=2026-11-01');

    // M, N and K
    expect(body).toMatchObject({ posted: 3, open: 1, collected: 2, distinctRecipients: 1 });
    expect(body.claimedPct).toBe(66.7);
  });

  test('a period with no offers is all zeros', async () => {
    expect(await outcomes('from=2026-07-01&to=2026-07-31')).toEqual({
      posted: 0,
      open: 0,
      claimed: 0,
      collected: 0,
      expiredUnclaimed: 0,
      expiredClaimed: 0,
      cancelled: 0,
      claimedPct: 0,
      distinctRecipients: 0,
    });
  });
});

describe('offered by donor', () => {
  test('counts a split offer once, at what was first offered', async () => {
    const rows = await newReportingService().offeredByDonor({
      from: '2026-10-01',
      to: '2026-10-31',
    });

    expect(rows).toEqual([
      // A 30 + F 5 + G 6 + N 1.2. B and C are part of A
      { key: ids.ouma, label: "Ouma's Bakery", kg: 42.2 },
      // D 12.3 + E 8 + H 4 + I 15 + M 2
      { key: ids.harbour, label: 'Harbour Hotel', kg: 41.3 },
    ]);
  });
});

describe('export', () => {
  const HEADINGS = 'Date;Donor;Recipient;Category;Kilograms;Meals;Certificate number';

  beforeAll(async () => {
    const a = (await HandoverRecordModel.findOne({ collectedQuantityKg: 20 }))!;
    await TaxCertificateModel.create({
      donorOrganisationId: new Types.ObjectId(ids.ouma),
      periodStart: sa('2026-10-01T00:00:00'),
      periodEnd: sa('2026-10-31T23:59:59'),
      handoverRecordIds: [a._id],
      totalQuantityKg: 20,
      valuationByCategory: [{ category: 'bakery', quantityKg: 20, ratePerKg: 22, value: 440 }],
      totalValue: 440,
      certificateNumber: 'FEDSA-2026-0001',
      issuedAt: sa('2026-11-02T09:00:00'),
      donor: { name: "Ouma's Bakery", addressLine: '12 Long Street', suburb: 'Woodstock' },
      placeholderRates: false,
    });

    // P: in December, between names a spreadsheet has to quote or guard
    const formula = await createOrganisation({
      type: 'donor',
      name: '=HYPERLINK("https://evil.example","Open")',
    });
    const hopeHouse = await createOrganisation({
      type: 'recipient',
      name: 'Hope House, "Bo-Kaap"\nSalt River',
    });
    const p = await postOffer({
      donor: formula,
      postedAt: sa('2026-12-03T08:00:00'),
      kg: 3.3,
      status: 'collected',
      category: 'prepared',
    });
    await collect(p, hopeHouse, 3.3, sa('2026-12-03T10:00:00'));
  });

  /** the lines after the byte order mark. the last is empty, as the file ends with CRLF */
  async function exportCsv(query: string) {
    const res = await admin.get(`/api/reports/export?${query}`);
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    return { res, bytes, lines: bytes.toString('utf8').slice(1).split('\r\n') };
  }

  const fields = (line: string) => line.split(';');

  test('writes the header block, then one row per handover the impact report counts', async () => {
    const before = Date.now();
    const { res, bytes, lines } = await exportCsv('from=2026-10-01&to=2026-10-31&format=csv');

    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="fedsa-impact-2026-10-01-to-2026-10-31.csv"',
    );
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    expect(lines).toEqual([
      'Period;2026-10-01 to 2026-10-31',
      expect.stringMatching(/^Generated at;\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
      'Total kilograms;43,7',
      // the rows' meals add up to 108, but 43.7 kg is 109 meals
      'Total meals;109',
      '',
      HEADINGS,
      // I, still 30 September in UTC
      '2026-10-01;Harbour Hotel;Bonteheuwel Soup Kitchen;Bakery;15;37;',
      "2026-10-02;Ouma's Bakery;Siyakhula Shelter;Bakery;20;50;FEDSA-2026-0001",
      "2026-10-03;Ouma's Bakery;Bonteheuwel Soup Kitchen;Bakery;7,5;18;",
      // N, in the last second of October
      "2026-10-31;Ouma's Bakery;Siyakhula Shelter;Bakery;1,2;3;",
      '',
    ]);

    const generatedAt = new Date(`${lines[1]!.slice('Generated at;'.length)}:00+02:00`);
    expect(generatedAt.getTime()).toBeGreaterThan(before - 60_000);
    expect(generatedAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  test('has the impact report totals for the same period, and rows that add up to them', async () => {
    for (const [from, to] of [
      ['2026-10-01', '2026-10-31'],
      ['2026-08-01', '2026-12-31'],
      ['2026-10-01', '2026-10-01'],
      ['2026-10-31', '2026-11-01'],
      ['2026-09-30', '2026-09-30'],
    ]) {
      const report = await impact(`from=${from}&to=${to}`);
      const { lines } = await exportCsv(`from=${from}&to=${to}`);

      expect(lines[2]).toBe(`Total kilograms;${String(report.totals.kg).replace('.', ',')}`);
      expect(lines[3]).toBe(`Total meals;${report.totals.meals}`);
      const rowKg = lines
        .slice(6, -1)
        .reduce((sum, line) => sum + Number(fields(line)[4]!.replace(',', '.')), 0);
      expect(roundKg(rowKg)).toBe(report.totals.kg);
    }
  });

  test('has no row for a handover only the donor has confirmed', async () => {
    // H: the donor confirmed on 9 October and the recipient never did
    expect(await HandoverRecordModel.countDocuments({ recipientConfirmedAt: null })).toBe(1);
    const { lines } = await exportCsv('from=2026-10-09&to=2026-10-09');

    expect(lines.slice(2)).toEqual(['Total kilograms;0', 'Total meals;0', '', HEADINGS, '']);
  });

  test('gives the certificate number of a certified handover and leaves the rest blank', async () => {
    const { lines } = await exportCsv('from=2026-10-01&to=2026-10-31');

    expect(lines.slice(6, -1).map((line) => fields(line)[6])).toEqual([
      '',
      'FEDSA-2026-0001',
      '',
      '',
    ]);
  });

  test('quotes organisation names and guards one that starts like a formula', async () => {
    const { lines } = await exportCsv('from=2026-12-01&to=2026-12-31');

    expect(lines.slice(2)).toEqual([
      'Total kilograms;3,3',
      'Total meals;8',
      '',
      HEADINGS,
      '2026-12-03;"\'=HYPERLINK(""https://evil.example"",""Open"")";"Hope House, ""Bo-Kaap""\nSalt River";Prepared meals;3,3;8;',
      '',
    ]);
  });

  test('a period with no handovers has the header block and no rows', async () => {
    const { lines } = await exportCsv('from=2026-07-01&to=2026-07-31');

    expect(lines).toEqual([
      'Period;2026-07-01 to 2026-07-31',
      expect.stringMatching(/^Generated at;/),
      'Total kilograms;0',
      'Total meals;0',
      '',
      HEADINGS,
      '',
    ]);
  });

  test('refuses any format other than CSV', async () => {
    for (const format of ['pdf', 'xlsx']) {
      const res = await admin.get(
        `/api/reports/export?from=2026-10-01&to=2026-10-31&format=${format}`,
      );
      expect(res.status).toBe(400);
      const { error } = ErrorEnvelope.parse(await res.json());
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(error.fields ?? {})).toEqual(['format']);
    }
  });
});

describe('access', () => {
  test('only administrators read reports', async () => {
    const coordinator = await signedInClient(
      baseUrl,
      (await createUser({ role: 'coordinator' })).email,
    );
    const donor = await signedInClient(
      baseUrl,
      (await createUser({ role: 'donor', organisationId: new Types.ObjectId(ids.ouma) })).email,
    );
    const recipient = await signedInClient(
      baseUrl,
      (await createUser({ role: 'recipient', organisationId: new Types.ObjectId(ids.siyakhula) }))
        .email,
    );
    const anonymous = new TestClient(baseUrl);

    for (const path of [
      '/api/reports/impact?from=2026-10-01&to=2026-10-31',
      '/api/reports/outcomes?from=2026-10-01&to=2026-10-31',
      '/api/reports/export?from=2026-10-01&to=2026-10-31&format=csv',
    ]) {
      for (const client of [coordinator, donor, recipient]) {
        const res = await client.get(path);
        expect(res.status).toBe(403);
        expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('FORBIDDEN');
      }
      const res = await anonymous.get(path);
      expect(res.status).toBe(401);
      expect(ErrorEnvelope.parse(await res.json()).error.code).toBe('UNAUTHENTICATED');
    }
  });

  test('a missing, malformed or reversed range is refused', async () => {
    const cases = [
      ['/api/reports/impact?to=2026-10-31', 'from'],
      ['/api/reports/impact?from=2026-10-01&to=2026-10-31&groupBy=week', 'groupBy'],
      ['/api/reports/outcomes?from=2026-10-01&to=31-10-2026', 'to'],
      ['/api/reports/outcomes?from=2026-10-31&to=2026-10-01', 'to'],
      ['/api/reports/export?from=2026-10-31&to=2026-10-01', 'to'],
    ] as const;

    for (const [path, field] of cases) {
      const res = await admin.get(path);
      expect(res.status).toBe(400);
      const { error } = ErrorEnvelope.parse(await res.json());
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(Object.keys(error.fields ?? {})).toEqual([field]);
    }
  });
});

import {
  CertificateListResponse,
  CertificateResponse,
  ErrorEnvelope,
  FoodCategory,
  ValuationRateListResponse,
  type TaxCertificate,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import { PDFParse } from 'pdf-parse';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  AuditLogModel,
  ClaimModel,
  CounterModel,
  HandoverRecordModel,
  OfferModel,
  OrganisationModel,
  TaxCertificateModel,
  ValuationRateModel,
} from '../../src/db/index.js';
import { formatRand } from '../../src/reporting/certificate-pdf.js';
import type { TestClient } from '../test-client.js';
import {
  anonymousClient,
  createOrganisation,
  createUser,
  signedInClient,
  startTestApp,
} from './test-app.js';
import { DUPLICATE_KEY, START_TIMEOUT_MS, startTestDb } from './test-db.js';

type Organisation = Awaited<ReturnType<typeof createOrganisation>>;

let stopTestDb: (() => Promise<void>) | undefined;
let closeApp: (() => Promise<void>) | undefined;
let baseUrl = '';
let adminId = '';
let admin: TestClient;
let coordinator: TestClient;
let recipient: Organisation;

/** a wall-clock time in Cape Town */
const sa = (local: string) => new Date(`${local}+02:00`);

const HOUR = 60 * 60 * 1000;
const SEPTEMBER = { periodStart: '2026-09-01', periodEnd: '2026-09-30' };

const PLACEHOLDERS: Record<FoodCategory, number> = {
  bakery: 22,
  produce: 14,
  dairy: 12.99,
  prepared: 45,
  dry: 26,
  other: 20,
};

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const app = await startTestApp();
  baseUrl = app.baseUrl;
  closeApp = app.close;

  await ValuationRateModel.create(
    FoodCategory.options.map((category) => ({ category, ratePerKg: PLACEHOLDERS[category] })),
  );
  recipient = await createOrganisation({ type: 'recipient', name: 'Siyakhula Shelter' });

  const administrator = await createUser({ role: 'administrator' });
  adminId = administrator.id;
  admin = await signedInClient(baseUrl, administrator.email);
  coordinator = await signedInClient(baseUrl, (await createUser({ role: 'coordinator' })).email);
}, START_TIMEOUT_MS);

afterAll(async () => {
  await closeApp?.();
  await stopTestDb?.();
});

let referenceCount = 0;

/** an offer, its claim and the handover. a null `recipientConfirmedAt` means only the donor confirmed */
async function donation(
  donor: Organisation,
  category: FoodCategory,
  kg: number,
  recipientConfirmedAt: Date | null,
  donorConfirmedAt = new Date((recipientConfirmedAt ?? new Date()).getTime() - HOUR / 4),
) {
  referenceCount += 1;
  const postedAt = new Date(donorConfirmedAt.getTime() - 2 * HOUR);
  const offer = await OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: new Types.ObjectId(),
    reference: `C${referenceCount.toString().padStart(3, '0')}`,
    title: 'Fixture offer',
    category,
    offeredQuantityKg: kg,
    coldChain: 'ambient',
    availableFrom: postedAt,
    collectionDeadline: new Date(postedAt.getTime() + 6 * HOUR),
    status: recipientConfirmedAt ? 'collected' : 'claimed',
    createdAt: postedAt,
  });
  const claim = await ClaimModel.create({
    offerId: offer._id,
    recipientOrganisationId: recipient._id,
    claimedByUserId: new Types.ObjectId(),
    claimedAt: new Date(postedAt.getTime() + HOUR / 2),
    transportNeeded: false,
    status: recipientConfirmedAt ? 'fulfilled' : 'active',
  });
  return HandoverRecordModel.create({
    claimId: claim._id,
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

/** set on the record directly, as no route resolves a dispute yet */
function markDisputed(handoverId: Types.ObjectId) {
  return HandoverRecordModel.updateOne(
    { _id: handoverId },
    { $set: { conditionOnReceipt: 'problem', conditionNotes: 'Half the crate had gone soft' } },
  );
}

function markResolved(handoverId: Types.ObjectId) {
  return HandoverRecordModel.updateOne(
    { _id: handoverId },
    {
      $set: {
        resolvedAt: sa('2026-09-12T09:00:00'),
        resolvedByUserId: new Types.ObjectId(),
        resolutionNote: 'Donor and shelter agreed the collected figure',
      },
    },
  );
}

async function donorClient(donor: Organisation) {
  const user = await createUser({ role: 'donor', organisationId: donor._id });
  return signedInClient(baseUrl, user.email);
}

function setRates(items: { category: FoodCategory; ratePerKg: number }[]) {
  return admin.request('PUT', '/api/valuation-rates', { items });
}

function issue(donor: Organisation, period = SEPTEMBER) {
  return admin.post('/api/tax-certificates', { donorOrganisationId: donor.id, ...period });
}

async function issued(donor: Organisation, period = SEPTEMBER) {
  const res = await issue(donor, period);
  expect(res.status, await res.clone().text()).toBe(201);
  return CertificateResponse.parse(await res.json()).certificate;
}

async function errorCode(res: Response) {
  return ErrorEnvelope.parse(await res.json()).error.code;
}

async function counterSeq() {
  return (await CounterModel.findOne({ name: 'taxCertificates' }))?.seq ?? 0;
}

const sequenceOf = (certificate: TaxCertificate) =>
  Number(certificate.certificateNumber.split('-')[2]);

async function pdfText(pdf: Buffer) {
  const parser = new PDFParse({ data: new Uint8Array(pdf) });
  try {
    // en-ZA groups digits with a no-break space, which extraction may turn into a plain one
    return (await parser.getText()).text.replace(/\s+/g, ' ');
  } finally {
    await parser.destroy();
  }
}

describe('valuation rates', () => {
  test('an administrator reads them, and the ones not yet set show as placeholders', async () => {
    const res = await setRates([
      { category: 'bakery', ratePerKg: 25.4 },
      { category: 'produce', ratePerKg: 18.35 },
    ]);
    expect(res.status).toBe(200);
    const { items } = ValuationRateListResponse.parse(await res.json());

    expect(items.map((rate) => rate.category)).toEqual(FoodCategory.options);
    expect(items.find((rate) => rate.category === 'bakery')).toMatchObject({
      ratePerKg: 25.4,
      updatedByUserId: adminId,
    });
    expect(items.find((rate) => rate.category === 'produce')).toMatchObject({
      ratePerKg: 18.35,
      updatedByUserId: adminId,
    });
    for (const category of ['dairy', 'prepared', 'dry', 'other'] as const) {
      expect(items.find((rate) => rate.category === category)!.updatedByUserId).toBeNull();
    }

    const read = await admin.get('/api/valuation-rates');
    expect(ValuationRateListResponse.parse(await read.json()).items).toEqual(items);
  });

  test('every rate changed writes an audit row with the old and new rate', async () => {
    const res = await setRates([{ category: 'dry', ratePerKg: 30 }]);
    expect(res.status).toBe(200);

    const dry = await ValuationRateModel.findOne({ category: 'dry' });
    const rows = await AuditLogModel.find({ action: 'update_valuation_rates', targetId: dry!._id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: new Types.ObjectId(adminId),
      targetType: 'valuationRates',
      note: 'dry from 26.00 to 30.00 rand per kg',
    });
    expect(await AuditLogModel.countDocuments({ action: 'update_valuation_rates' })).toBe(3);
  });

  test('a rate with part of a cent is refused and nothing changes', async () => {
    const res = await setRates([
      { category: 'dry', ratePerKg: 31 },
      { category: 'other', ratePerKg: 12.345 },
    ]);
    expect(res.status).toBe(400);
    const body = ErrorEnvelope.parse(await res.json());
    expect(body.error.fields).toEqual({ 'items.1.ratePerKg': 'Use rand and cents' });
    expect((await ValuationRateModel.findOne({ category: 'dry' }))!.ratePerKg).toBe(30);
  });

  test('only administrators can read or change them', async () => {
    const donor = await donorClient(await createOrganisation({ type: 'donor' }));
    expect((await donor.get('/api/valuation-rates')).status).toBe(403);
    expect((await coordinator.get('/api/valuation-rates')).status).toBe(403);
    const put = await coordinator.request('PUT', '/api/valuation-rates', {
      items: [{ category: 'bakery', ratePerKg: 1 }],
    });
    expect(put.status).toBe(403);
    expect((await (await anonymousClient(baseUrl)).get('/api/valuation-rates')).status).toBe(401);
  });
});

describe('issuing', () => {
  let ouma: Organisation;
  let certificate: TaxCertificate;
  let handoverIds: string[];

  beforeAll(async () => {
    ouma = await createOrganisation({ type: 'donor', name: "Ouma's Bakery" });
    const handovers = [
      await donation(ouma, 'bakery', 12.5, sa('2026-09-03T10:00:00')),
      await donation(ouma, 'produce', 37.5, sa('2026-09-10T11:00:00')),
      await donation(ouma, 'bakery', 7.25, sa('2026-09-17T15:00:00')),
      await donation(ouma, 'dairy', 10, sa('2026-09-24T09:00:00')),
    ];
    handoverIds = handovers.map((h) => h.id as string);
    // only the donor has confirmed this one
    await donation(ouma, 'dairy', 4, null, sa('2026-09-25T09:00:00'));
  });

  /**
   * bakery 12.5 + 7.25 = 19.75 kg at R25.40 = R501.65
   * produce 37.5 kg at R18.35 = R688.125, which rounds up to R688.13
   * dairy 10 kg at the R12.99 placeholder = R129.90
   * 67.25 kg and R1 319.68 in all
   */
  test('values the confirmed handovers by category, to the cent', async () => {
    const before = await counterSeq();
    certificate = await issued(ouma);

    expect(certificate.valuationByCategory).toEqual([
      { category: 'bakery', quantityKg: 19.75, ratePerKg: 25.4, value: 501.65 },
      { category: 'produce', quantityKg: 37.5, ratePerKg: 18.35, value: 688.13 },
      { category: 'dairy', quantityKg: 10, ratePerKg: 12.99, value: 129.9 },
    ]);
    expect(certificate.totalQuantityKg).toBe(67.25);
    expect(certificate.totalValue).toBe(1319.68);
    expect([...certificate.handoverRecordIds].sort()).toEqual([...handoverIds].sort());
    expect(certificate).toMatchObject({
      donorOrganisationId: ouma.id,
      periodStart: '2026-08-31T22:00:00.000Z',
      periodEnd: '2026-09-30T21:59:59.999Z',
    });

    const year = new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      year: 'numeric',
    }).format(new Date(certificate.issuedAt));
    const seq = String(before + 1).padStart(4, '0');
    expect(certificate.certificateNumber).toBe(`FEDSA-${year}-${seq}`);
  });

  test('stores the donor as it was and whether any rate was a placeholder', async () => {
    const stored = await TaxCertificateModel.findById(certificate.id).lean();
    expect(stored).toMatchObject({
      placeholderRates: true,
      documentUrl: null,
      donor: {
        name: "Ouma's Bakery",
        addressLine: '12 Long Street',
        suburb: 'Woodstock',
        taxReferenceNumber: null,
      },
    });
  });

  test('writes an audit row', async () => {
    const rows = await AuditLogModel.find({
      action: 'issue_certificate',
      targetId: certificate.id,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: new Types.ObjectId(adminId),
      targetType: 'taxCertificates',
    });
  });

  test('leaves the handovers as they were', async () => {
    const handovers = await HandoverRecordModel.find({ _id: { $in: handoverIds } }).lean();
    for (const handover of handovers) {
      expect(handover.updatedAt.getTime()).toBe(handover.createdAt.getTime());
    }
  });

  test('a handover already certified is left off the next certificate', async () => {
    const late = await donation(ouma, 'bakery', 3, sa('2026-09-29T16:00:00'));

    const next = await issued(ouma, { periodStart: '2026-08-15', periodEnd: '2026-10-15' });
    expect(next.handoverRecordIds).toEqual([late.id]);
    expect(next.valuationByCategory).toEqual([
      { category: 'bakery', quantityKg: 3, ratePerKg: 25.4, value: 76.2 },
    ]);

    const again = await issue(ouma, { periodStart: '2026-08-15', periodEnd: '2026-10-15' });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe('INVALID_STATE');
  });

  test('changing the rates afterwards changes no certificate already issued', async () => {
    await setRates([
      { category: 'bakery', ratePerKg: 99 },
      { category: 'dairy', ratePerKg: 99 },
    ]);

    const res = await admin.get(`/api/tax-certificates?donorOrganisationId=${ouma.id}`);
    const { items } = CertificateListResponse.parse(await res.json());
    expect(items.find((c) => c.id === certificate.id)).toEqual(certificate);

    await ValuationRateModel.updateOne({ category: 'bakery' }, { $set: { ratePerKg: 25.4 } });
    await ValuationRateModel.updateOne(
      { category: 'dairy' },
      { $set: { ratePerKg: 12.99, updatedByUserId: null } },
    );
  });
});

describe('what is selected', () => {
  test('only handovers confirmed within the period in South African days', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Boundary Bakery' });
    // 23:59:59 on 31 August in Cape Town
    await donation(donor, 'bakery', 1, new Date('2026-08-31T21:59:59.000Z'));
    // midnight on 1 September in Cape Town, still 31 August in UTC
    const first = await donation(donor, 'bakery', 2, new Date('2026-08-31T22:00:00.000Z'));
    // the last millisecond of 30 September in Cape Town
    const last = await donation(donor, 'bakery', 4, new Date('2026-09-30T21:59:59.999Z'));
    // midnight on 1 October in Cape Town, still 30 September in UTC
    await donation(donor, 'bakery', 8, new Date('2026-09-30T22:00:00.000Z'));

    const certificate = await issued(donor);
    expect([...certificate.handoverRecordIds].sort()).toEqual([first.id, last.id].sort());
    expect(certificate.totalQuantityKg).toBe(6);
  });

  test('handovers only the donor has confirmed are left out', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Half Confirmed Deli' });
    const both = await donation(donor, 'prepared', 5, sa('2026-09-12T13:00:00'));
    await donation(donor, 'prepared', 6, null, sa('2026-09-12T14:00:00'));

    const certificate = await issued(donor);
    expect(certificate.handoverRecordIds).toEqual([both.id]);
  });

  test("another donor's handovers are never selected", async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Own Goods Only' });
    const other = await createOrganisation({ type: 'donor', name: 'Someone Else' });
    const own = await donation(donor, 'dry', 3, sa('2026-09-08T10:00:00'));
    await donation(other, 'dry', 30, sa('2026-09-08T10:00:00'));

    const certificate = await issued(donor);
    expect(certificate.handoverRecordIds).toEqual([own.id]);
  });

  test('an unresolved dispute is left off, and certified once a coordinator resolves it', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Disputed Produce' });
    const good = await donation(donor, 'produce', 6, sa('2026-09-09T10:00:00'));
    const disputed = await donation(donor, 'produce', 9, sa('2026-09-11T10:00:00'));
    await markDisputed(disputed._id);

    const first = await issued(donor);
    expect(first.handoverRecordIds).toEqual([good.id]);
    expect(first.totalQuantityKg).toBe(6);

    await markResolved(disputed._id);
    const second = await issued(donor);
    expect(second.handoverRecordIds).toEqual([disputed.id]);
    expect(second.valuationByCategory).toEqual([
      { category: 'produce', quantityKg: 9, ratePerKg: 18.35, value: 165.15 },
    ]);
  });
});

describe('refusals', () => {
  test('a period holding only an unresolved dispute is refused', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Only A Dispute' });
    const disputed = await donation(donor, 'bakery', 5, sa('2026-09-05T09:00:00'));
    await markDisputed(disputed._id);
    const before = await counterSeq();

    const res = await issue(donor);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('INVALID_STATE');
    expect(await counterSeq()).toBe(before);
  });

  test('a donor with nothing to certify is refused and no number is used', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Nothing Yet' });
    await donation(donor, 'bakery', 5, null, sa('2026-09-05T09:00:00'));
    const before = await counterSeq();

    const res = await issue(donor);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('INVALID_STATE');
    expect(await counterSeq()).toBe(before);
    expect(await TaxCertificateModel.countDocuments({ donorOrganisationId: donor._id })).toBe(0);
  });

  test('a category with no rate is refused until one is set', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Odd Lots' });
    await donation(donor, 'other', 5, sa('2026-09-05T09:00:00'));
    const other = await ValuationRateModel.findOneAndDelete({ category: 'other' });
    const before = await counterSeq();

    const res = await issue(donor);
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('INVALID_STATE');
    expect(await counterSeq()).toBe(before);

    await ValuationRateModel.create({ category: 'other', ratePerKg: other!.ratePerKg });
  });

  test('an id that is not a donor organisation is a field error', async () => {
    const res = await admin.post('/api/tax-certificates', {
      donorOrganisationId: recipient.id,
      ...SEPTEMBER,
    });
    expect(res.status).toBe(400);
    expect(ErrorEnvelope.parse(await res.json()).error.fields).toHaveProperty(
      'donorOrganisationId',
    );
  });

  test('only an administrator can issue', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Self Issuing' });
    await donation(donor, 'bakery', 5, sa('2026-09-05T09:00:00'));
    const client = await donorClient(donor);

    const res = await client.post('/api/tax-certificates', {
      donorOrganisationId: donor.id,
      ...SEPTEMBER,
    });
    expect(res.status).toBe(403);
    expect(
      (
        await coordinator.post('/api/tax-certificates', {
          donorOrganisationId: donor.id,
          ...SEPTEMBER,
        })
      ).status,
    ).toBe(403);
  });
});

describe('reading and downloading', () => {
  let kaap: Organisation;
  let harbour: Organisation;
  let kaapClient: TestClient;
  let harbourClient: TestClient;
  let kaapCertificate: TaxCertificate;
  let harbourCertificate: TaxCertificate;

  beforeAll(async () => {
    kaap = await createOrganisation({ type: 'donor', name: 'Kaap Foods' });
    harbour = await createOrganisation({ type: 'donor', name: 'Harbour View Hotel' });
    await donation(kaap, 'dairy', 20, sa('2026-09-14T12:00:00'));
    await donation(kaap, 'bakery', 10, sa('2026-09-15T12:00:00'));
    await donation(harbour, 'bakery', 8, sa('2026-09-16T12:00:00'));
    kaapClient = await donorClient(kaap);
    harbourClient = await donorClient(harbour);
    kaapCertificate = await issued(kaap);
    harbourCertificate = await issued(harbour);
  });

  test('a donor lists its own certificates only', async () => {
    const res = await kaapClient.get('/api/tax-certificates');
    expect(res.status).toBe(200);
    expect(CertificateListResponse.parse(await res.json()).items).toEqual([kaapCertificate]);
  });

  test('a donor naming another donor gets 404', async () => {
    const res = await kaapClient.get(`/api/tax-certificates?donorOrganisationId=${harbour.id}`);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('NOT_FOUND');
  });

  test("a donor asking for another donor's PDF gets 404", async () => {
    const res = await kaapClient.get(`/api/tax-certificates/${harbourCertificate.id}/pdf`);
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('NOT_FOUND');
  });

  test('an administrator lists every donor, or one', async () => {
    const all = CertificateListResponse.parse(
      await (await admin.get('/api/tax-certificates')).json(),
    );
    expect(all.items.map((c) => c.id)).toEqual(
      expect.arrayContaining([kaapCertificate.id, harbourCertificate.id]),
    );

    const res = await admin.get(`/api/tax-certificates?donorOrganisationId=${harbour.id}`);
    expect(CertificateListResponse.parse(await res.json()).items).toEqual([harbourCertificate]);
  });

  test('coordinators and recipients cannot list certificates', async () => {
    expect((await coordinator.get('/api/tax-certificates')).status).toBe(403);
    const recipientUser = await createUser({ role: 'recipient', organisationId: recipient._id });
    const client = await signedInClient(baseUrl, recipientUser.email);
    expect((await client.get('/api/tax-certificates')).status).toBe(403);
  });

  test('the PDF downloads with the certificate, the total and the placeholder notice', async () => {
    const res = await kaapClient.get(`/api/tax-certificates/${kaapCertificate.id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="${kaapCertificate.certificateNumber}.pdf"`,
    );

    const pdf = Buffer.from(await res.arrayBuffer());
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    const text = await pdfText(pdf);
    expect(text).toContain(kaapCertificate.certificateNumber);
    expect(text).toContain('Kaap Foods');
    // 20 kg of dairy at R12.99 and 10 kg of bakery at R25.40
    expect(kaapCertificate.totalValue).toBe(513.8);
    expect(text).toContain(formatRand(513.8).replace(/\s+/g, ' '));
    expect(text).toContain('Valuation rates are placeholders');
    expect(text).toContain('Not supplied');
  });

  test('no placeholder notice when every rate used was set by an administrator', async () => {
    const res = await harbourClient.get(`/api/tax-certificates/${harbourCertificate.id}/pdf`);
    const text = await pdfText(Buffer.from(await res.arrayBuffer()));
    expect(text).toContain(harbourCertificate.certificateNumber);
    expect(text).not.toContain('placeholders');
  });

  test('the same certificate always downloads as the same bytes', async () => {
    const path = `/api/tax-certificates/${kaapCertificate.id}/pdf`;
    const first = Buffer.from(await (await kaapClient.get(path)).arrayBuffer());

    await OrganisationModel.updateOne(
      { _id: kaap._id },
      { $set: { name: 'Kaap Foods (Pty) Ltd', taxReferenceNumber: '9012345678' } },
    );
    await setRates([{ category: 'dairy', ratePerKg: 50 }]);

    const second = Buffer.from(await (await kaapClient.get(path)).arrayBuffer());
    const third = Buffer.from(await (await admin.get(path)).arrayBuffer());
    expect(second.equals(first)).toBe(true);
    expect(third.equals(first)).toBe(true);

    await ValuationRateModel.updateOne(
      { category: 'dairy' },
      { $set: { ratePerKg: 12.99, updatedByUserId: null } },
    );
  });

  test('an unknown certificate is 404 for an administrator too', async () => {
    const res = await admin.get(`/api/tax-certificates/${'0'.repeat(24)}/pdf`);
    expect(res.status).toBe(404);
  });
});

describe('concurrent issuing', () => {
  test('certificates for different donors at once get numbers with no gaps', async () => {
    const donors: Organisation[] = [];
    for (let i = 0; i < 8; i += 1) {
      const donor = await createOrganisation({ type: 'donor', name: `Rush Donor ${i}` });
      await donation(donor, 'bakery', 1 + i, sa('2026-09-20T10:00:00'));
      donors.push(donor);
    }
    const before = await counterSeq();

    const responses = await Promise.all(donors.map((donor) => issue(donor)));

    expect(responses.map((res) => res.status)).toEqual(donors.map(() => 201));
    const certificates = await Promise.all(
      responses.map(async (res) => CertificateResponse.parse(await res.json()).certificate),
    );
    const numbers = certificates.map(sequenceOf).sort((a, b) => a - b);
    expect(numbers).toEqual(donors.map((_, i) => before + 1 + i));
    expect(await counterSeq()).toBe(before + donors.length);
  });

  test('issuing for the same donor at once never certifies a handover twice', async () => {
    const donor = await createOrganisation({ type: 'donor', name: 'Double Tap Bakery' });
    const handovers = [
      await donation(donor, 'bakery', 2, sa('2026-09-04T10:00:00')),
      await donation(donor, 'produce', 3, sa('2026-09-18T10:00:00')),
      await donation(donor, 'bakery', 4, sa('2026-10-01T10:00:00')),
      await donation(donor, 'dairy', 5, sa('2026-10-02T10:00:00')),
    ];
    const october = { periodStart: '2026-10-01', periodEnd: '2026-10-03' };
    const both = { periodStart: '2026-09-01', periodEnd: '2026-10-03' };
    const periods = [SEPTEMBER, both, october, both, SEPTEMBER, both, october, both];
    const before = await counterSeq();

    const responses = await Promise.all(periods.map((period) => issue(donor, period)));

    const created = responses.filter((res) => res.status === 201);
    expect(created.length).toBeGreaterThan(0);
    for (const res of responses.filter((r) => r.status !== 201)) {
      expect(res.status).toBe(409);
      expect(await errorCode(res)).toBe('INVALID_STATE');
    }

    const stored = await TaxCertificateModel.find({ donorOrganisationId: donor._id });
    expect(stored).toHaveLength(created.length);
    const certified = stored.flatMap((c) => c.handoverRecordIds.map((id) => id.toString()));
    expect(new Set(certified).size).toBe(certified.length);
    expect([...certified].sort()).toEqual(handovers.map((h) => h.id as string).sort());
    expect(await counterSeq()).toBe(before + created.length);
  });

  test('the database itself refuses a second certificate holding a certified handover', async () => {
    const existing = (await TaxCertificateModel.findOne().lean())!;

    await expect(
      TaxCertificateModel.create({
        ...existing,
        _id: new Types.ObjectId(),
        certificateNumber: `${existing.certificateNumber}-COPY`,
      }),
    ).rejects.toMatchObject({ code: DUPLICATE_KEY });
  });
});

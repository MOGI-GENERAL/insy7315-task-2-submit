import {
  FoodCategory,
  type CertificateListResponse,
  type CertificateResponse,
  type ExportQuery,
  type ImpactQuery,
  type ImpactResponse,
  type IssueCertificateRequest,
  type ListCertificatesQuery,
  type OutcomesResponse,
  type ReportRangeQuery,
  type TaxCertificateView,
  type UpdateValuationRatesRequest,
  type ValuationRateListResponse,
} from '@fedsa/contract';
import { Types } from 'mongoose';
import {
  runInTransaction,
  type CounterRepository,
  type HandoverRepository,
  type KgRow,
  type OfferRepository,
  type OrganisationRepository,
  type TaxCertificateRepository,
  type ValuationRateRepository,
} from '../db/index.js';
import { InvalidStateError, NotFoundError, ValidationError } from '../errors.js';
import { CATEGORY_LABELS, renderCertificatePdf } from '../reporting/certificate-pdf.js';
import { toCsv, type CsvRow } from '../reporting/csv.js';
import type { AuditService } from './audit-service.js';
import { SA_OFFSET, dayRange } from './day-range.js';
import { roundKg, toMeals } from './meals.js';
import type { SessionUser } from './user-service.js';
import { isWholeCents, valueByCategory } from './valuation.js';
import { certificateView, valuationRateView } from './views.js';

const CERTIFICATE_COUNTER = 'taxCertificates';

const saYear = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  year: 'numeric',
});

/** Swedish writes `2026-10-05 14:32`, which Excel reads as a date and time */
const saDateTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Africa/Johannesburg',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** one decimal place, and 0 rather than NaN for an empty period */
function percent(part: number, whole: number) {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

/** `FEDSA-2026-0001`. the year is the year of issue in South Africa */
function certificateNumber(issuedAt: Date, seq: number) {
  return `FEDSA-${saYear.format(issuedAt)}-${String(seq).padStart(4, '0')}`;
}

/**
 * impact reads handovers by the day the recipient confirmed. outcomes and the
 * offered totals read offers by the day they were posted
 */
export class ReportingService {
  private readonly handovers: HandoverRepository;
  private readonly offers: OfferRepository;
  private readonly organisations: OrganisationRepository;
  private readonly rates: ValuationRateRepository;
  private readonly certificates: TaxCertificateRepository;
  private readonly counters: CounterRepository;
  private readonly audit: AuditService;

  constructor(
    handovers: HandoverRepository,
    offers: OfferRepository,
    organisations: OrganisationRepository,
    rates: ValuationRateRepository,
    certificates: TaxCertificateRepository,
    counters: CounterRepository,
    audit: AuditService,
  ) {
    this.handovers = handovers;
    this.offers = offers;
    this.organisations = organisations;
    this.rates = rates;
    this.certificates = certificates;
    this.counters = counters;
    this.audit = audit;
  }

  /** the total is converted to meals on its own and can be more than the rows' meals added up */
  async monthlyImpact(query: ImpactQuery): Promise<ImpactResponse> {
    const groups = await this.handovers.collectedKgBy(
      query.groupBy,
      dayRange(query.from, query.to),
      SA_OFFSET,
    );
    const kg = roundKg(groups.reduce((sum, group) => sum + group.kg, 0));
    return {
      rows: groups.map((group) => ({
        key: group.key,
        label: group.label,
        kg: roundKg(group.kg),
        meals: toMeals(group.kg),
      })),
      totals: { kg, meals: toMeals(kg) },
    };
  }

  /** `claimedPct` is the share of posted offers a recipient claimed and did not release */
  async claimedVsExpired(query: ReportRangeQuery) {
    const counts = await this.offers.outcomeCounts(dayRange(query.from, query.to));
    const claimedAndKept = counts.claimed + counts.collected + counts.expiredClaimed;
    return { ...counts, claimedPct: percent(claimedAndKept, counts.posted) };
  }

  distinctRecipientsServed(query: ReportRangeQuery) {
    return this.offers.countRecipientsServed(dayRange(query.from, query.to));
  }

  async outcomes(query: ReportRangeQuery): Promise<OutcomesResponse> {
    const [counts, distinctRecipients] = await Promise.all([
      this.claimedVsExpired(query),
      this.distinctRecipientsServed(query),
    ]);
    return { ...counts, distinctRecipients };
  }

  /** what each donor put on offer. a split offer counts once, at its original quantity */
  async offeredByDonor(query: ReportRangeQuery): Promise<KgRow[]> {
    const groups = await this.offers.offeredKgByDonor(dayRange(query.from, query.to));
    return groups.map((group) => ({ ...group, kg: roundKg(group.kg) }));
  }

  /**
   * header totals come from `monthlyImpact` and match the screen exactly.
   * the contract lists PDF, but only CSV is built
   */
  async exportImpact(query: ExportQuery, now = new Date()) {
    if (query.format !== 'csv') {
      throw new ValidationError({ format: 'Only CSV export is available' });
    }
    const [impact, handovers] = await Promise.all([
      this.monthlyImpact({ from: query.from, to: query.to, groupBy: 'month' }),
      this.handovers.collectedRows(dayRange(query.from, query.to), SA_OFFSET),
    ]);

    const rows: CsvRow[] = [
      ['Period', `${query.from} to ${query.to}`],
      ['Generated at', saDateTime.format(now)],
      ['Total kilograms', impact.totals.kg],
      ['Total meals', impact.totals.meals],
      [],
      ['Date', 'Donor', 'Recipient', 'Category', 'Kilograms', 'Meals', 'Certificate number'],
      ...handovers.map((handover) => [
        handover.day,
        handover.donor,
        handover.recipient,
        CATEGORY_LABELS[handover.category],
        roundKg(handover.kg),
        toMeals(handover.kg),
        handover.certificateNumber ?? '',
      ]),
    ];
    return { filename: `fedsa-impact-${query.from}-to-${query.to}.csv`, csv: toCsv(rows) };
  }

  /** a rate with a null `updatedByUserId` is still a placeholder */
  async listRates(): Promise<ValuationRateListResponse> {
    const rates = await this.rates.list();
    const order = (category: FoodCategory) => FoodCategory.options.indexOf(category);
    rates.sort((a, b) => order(a.category) - order(b.category));
    return { items: rates.map(valuationRateView) };
  }

  /** categories left out of the request keep their rate */
  async updateRates(
    adminId: string,
    input: UpdateValuationRatesRequest,
  ): Promise<ValuationRateListResponse> {
    const fields: Record<string, string> = {};
    input.items.forEach((item, i) => {
      if (!isWholeCents(item.ratePerKg)) fields[`items.${i}.ratePerKg`] = 'Use rand and cents';
    });
    if (Object.keys(fields).length > 0) throw new ValidationError(fields);

    await runInTransaction(async (session) => {
      for (const item of input.items) {
        const before = await this.rates.findByCategory(item.category, session);
        const after = await this.rates.set(
          item.category,
          item.ratePerKg,
          new Types.ObjectId(adminId),
          session,
        );
        const from = before ? before.ratePerKg.toFixed(2) : 'none';
        await this.audit.record(
          adminId,
          'update_valuation_rates',
          { type: 'valuationRates', id: after!._id },
          {
            note: `${item.category} from ${from} to ${item.ratePerKg.toFixed(2)} rand per kg`,
            session,
          },
        );
      }
    });
    return this.listRates();
  }

  /**
   * every issuance writes the one counter document in its transaction. two at once
   * conflict there, and the second retries after the first has committed
   */
  async issueCertificate(
    adminId: string,
    input: IssueCertificateRequest,
  ): Promise<CertificateResponse> {
    const donor = await this.organisations.findById(input.donorOrganisationId);
    if (!donor || donor.type !== 'donor') {
      throw new ValidationError({ donorOrganisationId: 'No donor organisation has this id' });
    }
    const range = dayRange(input.periodStart, input.periodEnd);

    const certificate = await runInTransaction(async (session) => {
      const issuedAt = new Date();
      const seq = await this.counters.next(
        CERTIFICATE_COUNTER,
        Number(saYear.format(issuedAt)),
        session,
      );

      const certified = await this.certificates.certifiedHandoverIds(donor._id, session);
      const handovers = await this.handovers.confirmedForDonor(
        donor._id,
        range,
        certified,
        session,
      );
      if (handovers.length === 0) {
        throw new InvalidStateError(
          'This donor has no confirmed handovers in this period that are not already certified',
        );
      }

      const rates = await this.rates.list(session);
      const ratePerKg = new Map(rates.map((rate) => [rate.category, rate.ratePerKg]));
      const missing = [...new Set(handovers.map((h) => h.category))].filter(
        (category) => !ratePerKg.has(category),
      );
      if (missing.length > 0) {
        throw new InvalidStateError(`Set a valuation rate for ${missing.join(', ')} first`);
      }
      const valuation = valueByCategory(handovers, ratePerKg);
      const placeholders = new Set(
        rates.filter((rate) => rate.updatedByUserId === null).map((rate) => rate.category),
      );

      const created = await this.certificates.create(
        {
          donorOrganisationId: donor._id,
          periodStart: range.$gte!,
          periodEnd: new Date(range.$lt!.getTime() - 1),
          handoverRecordIds: handovers.map((h) => h._id),
          totalQuantityKg: valuation.totalQuantityKg,
          valuationByCategory: valuation.lines,
          totalValue: valuation.totalValue,
          certificateNumber: certificateNumber(issuedAt, seq),
          issuedAt,
          donor: {
            name: donor.name,
            addressLine: donor.addressLine,
            suburb: donor.suburb,
            taxReferenceNumber: donor.taxReferenceNumber ?? null,
          },
          placeholderRates: valuation.lines.some((line) => placeholders.has(line.category)),
        },
        session,
      );
      await this.audit.record(
        adminId,
        'issue_certificate',
        { type: 'taxCertificates', id: created._id },
        { session },
      );
      return created;
    });

    return { certificate: certificateView(certificate) };
  }

  /** a donor sees its own certificates, and naming another donor gets 404 */
  async listCertificates(
    user: SessionUser,
    query: ListCertificatesQuery,
  ): Promise<CertificateListResponse> {
    let donorOrganisationId = query.donorOrganisationId;
    if (user.role === 'donor') {
      if (donorOrganisationId && donorOrganisationId !== user.organisationId) {
        throw new NotFoundError();
      }
      donorOrganisationId = user.organisationId!;
    }

    const certificates = await this.certificates.list(
      donorOrganisationId ? { donorOrganisationId: new Types.ObjectId(donorOrganisationId) } : {},
    );
    return { items: certificates.map(certificateView) };
  }

  /** for the ownership guard on the PDF */
  async certificateOwner(certificateId: string) {
    const certificate = await this.certificates.findById(certificateId);
    return certificate ? certificate.donorOrganisationId : null;
  }

  /** rendered from stored fields only. the same certificate always gives the same file */
  async certificatePdf(certificateId: string) {
    const certificate = await this.certificates.findById(certificateId);
    if (!certificate) throw new NotFoundError();

    const handovers = await this.handovers.findCertifiable(certificate.handoverRecordIds);
    const view: TaxCertificateView = {
      ...certificateView(certificate),
      donor: {
        name: certificate.donor.name,
        addressLine: certificate.donor.addressLine,
        suburb: certificate.donor.suburb,
        taxReferenceNumber: certificate.donor.taxReferenceNumber ?? null,
      },
      handovers: handovers.map((handover) => ({
        id: handover._id.toString(),
        confirmedAt: handover.recipientConfirmedAt.toISOString(),
        category: handover.category,
        quantityKg: handover.collectedQuantityKg,
      })),
      placeholderRates: certificate.placeholderRates,
    };
    return {
      filename: `${certificate.certificateNumber}.pdf`,
      pdf: await renderCertificatePdf(view),
    };
  }
}

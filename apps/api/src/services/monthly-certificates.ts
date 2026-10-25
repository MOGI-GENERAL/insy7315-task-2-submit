import type { Logger } from 'pino';
import {
  AuditLogRepository,
  CounterRepository,
  HandoverRepository,
  NotificationRepository,
  OfferRepository,
  OrganisationRepository,
  TaxCertificateRepository,
  UserRepository,
  ValuationRateRepository,
} from '../db/index.js';
import { InvalidStateError } from '../errors.js';
import { createLogger } from '../logger.js';
import { channelSettings } from '../notifications/channel-settings.js';
import { AuditService } from './audit-service.js';
import { dayRange, monthDays } from './day-range.js';
import { NotificationService } from './notification-service.js';
import { NOTHING_TO_CERTIFY, ReportingService } from './reporting-service.js';
import { findOrCreateScheduler } from './scheduler-account.js';

export interface MonthlySummary {
  month: string;
  issued: { donorOrganisationId: string; certificateNumber: string }[];
  skipped: { donorOrganisationId: string; reason: string }[];
  failed: { donorOrganisationId: string; reason: string }[];
}

export class MonthlyCertificateService {
  private readonly reporting: ReportingService;
  private readonly organisations: OrganisationRepository;
  private readonly certificates: TaxCertificateRepository;
  private readonly users: UserRepository;
  private readonly notifications: NotificationService;

  constructor(
    reporting: ReportingService,
    organisations: OrganisationRepository,
    certificates: TaxCertificateRepository,
    users: UserRepository,
    notifications: NotificationService,
  ) {
    this.reporting = reporting;
    this.organisations = organisations;
    this.certificates = certificates;
    this.users = users;
    this.notifications = notifications;
  }

  /** a second run for the same month issues nothing, because those donors are skipped */
  async issueForMonth(month: string): Promise<MonthlySummary> {
    const { periodStart, periodEnd } = monthDays(month);
    const scheduler = await findOrCreateScheduler(this.users);
    const range = dayRange(periodStart, periodEnd);
    const start = range.$gte!.getTime();
    const end = range.$lt!.getTime() - 1;
    const summary: MonthlySummary = { month, issued: [], skipped: [], failed: [] };

    const donorIds = await this.organisations.idsMatching({ type: 'donor' });
    for (const donorId of donorIds) {
      const donorOrganisationId = String(donorId);

      const existing = await this.certificates.list({ donorOrganisationId: donorId });
      const done = existing.some(
        (c) => c.periodStart.getTime() === start && c.periodEnd.getTime() === end,
      );
      if (done) {
        summary.skipped.push({ donorOrganisationId, reason: 'already issued for this month' });
        continue;
      }

      try {
        const { certificate } = await this.reporting.issueCertificate(String(scheduler._id), {
          donorOrganisationId,
          periodStart,
          periodEnd,
        });
        summary.issued.push({
          donorOrganisationId,
          certificateNumber: certificate.certificateNumber,
        });
        void this.notifications.notifyOrganisations([donorOrganisationId], 'certificate_issued', {
          certificateNumber: certificate.certificateNumber,
          periodStart: certificate.periodStart,
          periodEnd: certificate.periodEnd,
        });
      } catch (err) {
        if (err instanceof InvalidStateError && err.message === NOTHING_TO_CERTIFY) {
          summary.skipped.push({ donorOrganisationId, reason: 'nothing to certify' });
        } else {
          const reason = err instanceof Error ? err.message : String(err);
          summary.failed.push({ donorOrganisationId, reason });
        }
      }
    }

    await this.notifications.whenIdle();
    return summary;
  }
}

/** for callers outside the API, which have no server to build the services */
export function createMonthlyCertificateService(
  env: NodeJS.ProcessEnv = process.env,
  log: Logger = createLogger(),
) {
  const notifications = new NotificationService(
    new NotificationRepository(),
    new UserRepository(),
    { ...channelSettings(env, log), logger: log },
  );
  const reporting = new ReportingService(
    new HandoverRepository(),
    new OfferRepository(),
    new OrganisationRepository(),
    new ValuationRateRepository(),
    new TaxCertificateRepository(),
    new CounterRepository(),
    new AuditService(new AuditLogRepository()),
  );
  return new MonthlyCertificateService(
    reporting,
    new OrganisationRepository(),
    new TaxCertificateRepository(),
    new UserRepository(),
    notifications,
  );
}

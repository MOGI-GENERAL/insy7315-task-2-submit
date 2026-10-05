import mongoose from 'mongoose';
import { createApp } from './app.js';
import {
  AuditLogRepository,
  bootstrapDb,
  ClaimRepository,
  CollectionRepository,
  CounterRepository,
  HandoverRepository,
  HealthRepository,
  NotificationRepository,
  OfferRepository,
  OrganisationRepository,
  SessionRepository,
  TaxCertificateRepository,
  UserRepository,
  ValuationRateRepository,
} from './db/index.js';
import { createLogger } from './logger.js';
import { createSessionStore } from './middleware/session.js';
import { twilioWebhookSettings } from './middleware/twilio-signature.js';
import { channelSettings } from './notifications/channel-settings.js';
import { LocalPhotoStore } from './photos/local-photo-store.js';
import { AuditService } from './services/audit-service.js';
import { ClaimService } from './services/claim-service.js';
import { CollectionService } from './services/collection-service.js';
import { DEFAULT_RADIUS_KM } from './services/eligibility.js';
import { ExpiryService, startExpirySweep } from './services/expiry-service.js';
import { HandoverService } from './services/handover-service.js';
import { HealthService } from './services/health-service.js';
import { NotificationService } from './services/notification-service.js';
import { OfferService } from './services/offer-service.js';
import { OrganisationService } from './services/organisation-service.js';
import { ReportingService } from './services/reporting-service.js';
import { UserService } from './services/user-service.js';
import { WebhookService } from './services/webhook-service.js';

const logger = createLogger();

async function start() {
  const mongodbUri = process.env.MONGODB_URI;
  const sessionSecret = process.env.SESSION_SECRET;
  if (!mongodbUri || !sessionSecret) {
    logger.fatal(
      'MONGODB_URI and SESSION_SECRET must be set. Copy apps/api/.env.example to apps/api/.env and fill it in',
    );
    process.exit(1);
  }

  const radiusKm = Number(process.env.MATCH_RADIUS_KM || DEFAULT_RADIUS_KM);
  if (!(radiusKm > 0)) {
    logger.fatal('MATCH_RADIUS_KM must be a number of kilometres above zero');
    process.exit(1);
  }

  let sessionStore;
  try {
    await mongoose.connect(mongodbUri);
    const result = await bootstrapDb();
    sessionStore = await createSessionStore();
    logger.info(result, 'database ready');
  } catch (err) {
    logger.fatal({ err }, 'could not connect to MongoDB or prepare the database');
    process.exit(1);
  }

  const notifications = new NotificationService(
    new NotificationRepository(),
    new UserRepository(),
    { ...channelSettings(process.env, logger), logger },
  );
  const photos = new LocalPhotoStore();
  const offers = new OfferService(
    new OfferRepository(),
    new OrganisationRepository(),
    new ClaimRepository(),
    new CollectionRepository(),
    new HandoverRepository(),
    new AuditService(new AuditLogRepository()),
    photos,
    notifications,
    { radiusKm, logger },
  );
  const claims = new ClaimService(
    new ClaimRepository(),
    new OfferRepository(),
    new OrganisationRepository(),
    new HandoverRepository(),
    new CollectionRepository(),
    offers,
    notifications,
    notifications,
    logger,
  );
  const handovers = new HandoverService(
    new HandoverRepository(),
    new ClaimRepository(),
    new OfferRepository(),
    new OrganisationRepository(),
    offers,
    new AuditService(new AuditLogRepository()),
    photos,
    notifications,
    logger,
  );
  const collections = new CollectionService(
    new CollectionRepository(),
    new ClaimRepository(),
    new OfferRepository(),
    new OrganisationRepository(),
    new AuditService(new AuditLogRepository()),
    notifications,
    logger,
  );
  const services = {
    // Render sets RENDER_GIT_COMMIT on every deploy
    health: new HealthService(new HealthRepository(), process.env.RENDER_GIT_COMMIT || 'dev'),
    users: new UserService(
      new UserRepository(),
      new OrganisationRepository(),
      new SessionRepository(),
      new AuditService(new AuditLogRepository()),
    ),
    organisations: new OrganisationService(
      new OrganisationRepository(),
      new OfferRepository(),
      new ClaimRepository(),
      new HandoverRepository(),
      new AuditService(new AuditLogRepository()),
    ),
    offers,
    claims,
    collections,
    handovers,
    notifications,
    reports: new ReportingService(
      new HandoverRepository(),
      new OfferRepository(),
      new OrganisationRepository(),
      new ValuationRateRepository(),
      new TaxCertificateRepository(),
      new CounterRepository(),
      new AuditService(new AuditLogRepository()),
    ),
    webhooks: new WebhookService(
      new UserRepository(),
      new OrganisationRepository(),
      new OfferRepository(),
      new NotificationRepository(),
      claims,
      logger,
    ),
    audit: new AuditService(new AuditLogRepository()),
  };
  const session = {
    secret: sessionSecret,
    store: sessionStore,
    // secure unless explicitly running locally, so a missing variable in a deployment fails safe
    secureCookie: process.env.NODE_ENV !== 'development',
  };
  const port = Number(process.env.PORT || 3000);

  const twilioWebhooks = twilioWebhookSettings(process.env, logger);

  createApp({ logger, services, session, twilioWebhooks }).listen(port, () => {
    logger.info(`api listening on ${port}`);
  });

  startExpirySweep(
    new ExpiryService(
      new OfferRepository(),
      new ClaimRepository(),
      new HandoverRepository(),
      new CollectionRepository(),
    ),
    logger,
  );
}

void start();

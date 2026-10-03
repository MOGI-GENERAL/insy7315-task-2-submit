import mongoose from 'mongoose';
import { createApp } from './app.js';
import {
  AuditLogRepository,
  bootstrapDb,
  ClaimRepository,
  CollectionRepository,
  HandoverRepository,
  HealthRepository,
  OfferRepository,
  OrganisationRepository,
  SessionRepository,
  UserRepository,
} from './db/index.js';
import { createLogger } from './logger.js';
import { createSessionStore } from './middleware/session.js';
import { LocalPhotoStore } from './photos/local-photo-store.js';
import { AuditService } from './services/audit-service.js';
import { LoggingClaimNotifier } from './services/claim-notifier.js';
import { ClaimService } from './services/claim-service.js';
import { DEFAULT_RADIUS_KM } from './services/eligibility.js';
import { HealthService } from './services/health-service.js';
import { LoggingNotifier } from './services/offer-notifier.js';
import { OfferService } from './services/offer-service.js';
import { OrganisationService } from './services/organisation-service.js';
import { UserService } from './services/user-service.js';

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

  const offerNotifier = new LoggingNotifier(logger);
  const offers = new OfferService(
    new OfferRepository(),
    new OrganisationRepository(),
    new ClaimRepository(),
    new CollectionRepository(),
    new HandoverRepository(),
    new AuditService(new AuditLogRepository()),
    new LocalPhotoStore(),
    offerNotifier,
    { radiusKm, logger },
  );
  const services = {
    // Render sets RENDER_GIT_COMMIT on every deploy
    health: new HealthService(new HealthRepository(), process.env.RENDER_GIT_COMMIT || 'dev'),
    users: new UserService(
      new UserRepository(),
      new OrganisationRepository(),
      new SessionRepository(),
    ),
    organisations: new OrganisationService(
      new OrganisationRepository(),
      new OfferRepository(),
      new ClaimRepository(),
      new HandoverRepository(),
      new AuditService(new AuditLogRepository()),
    ),
    offers,
    claims: new ClaimService(
      new ClaimRepository(),
      new OfferRepository(),
      new OrganisationRepository(),
      new HandoverRepository(),
      offers,
      offerNotifier,
      new LoggingClaimNotifier(logger),
      logger,
    ),
  };
  const session = {
    secret: sessionSecret,
    store: sessionStore,
    // secure unless explicitly running locally, so a missing variable in a deployment fails safe
    secureCookie: process.env.NODE_ENV !== 'development',
  };
  const port = Number(process.env.PORT || 3000);

  createApp({ logger, services, session }).listen(port, () => {
    logger.info(`api listening on ${port}`);
  });
}

void start();

import express, { type Router } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { csrfProtection } from './middleware/csrf.js';
import { loadCurrentUser } from './middleware/current-user.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { globalLimit } from './middleware/rate-limits.js';
import { securityHeaders } from './middleware/security-headers.js';
import { sessions, type SessionSettings } from './middleware/session.js';
import { authRouter } from './routes/auth-router.js';
import { healthRouter } from './routes/health-router.js';
import { meRouter } from './routes/me-router.js';
import { offerRouter } from './routes/offer-router.js';
import { organisationRouter } from './routes/organisation-router.js';
import type { HealthService } from './services/health-service.js';
import type { OfferService } from './services/offer-service.js';
import type { OrganisationService } from './services/organisation-service.js';
import type { UserService } from './services/user-service.js';

export interface AppServices {
  health: HealthService;
  users: UserService;
  organisations: OrganisationService;
  offers: OfferService;
}

export interface AppDeps {
  logger: Logger;
  services: AppServices;
  session: SessionSettings;
  /** lets tests mount throwaway routes in front of the 404 */
  extraRouters?: Router[];
}

/** Netlify's edge, then Render's load balancer */
const TRUSTED_PROXY_HOPS = 2;

export function createApp(deps: AppDeps) {
  const app = express();

  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.use(pinoHttp({ logger: deps.logger }));
  app.use(securityHeaders());
  app.use(express.json({ limit: '100kb' }));

  app.use(sessions(deps.session));
  app.use(globalLimit());
  app.use(csrfProtection);
  app.use(loadCurrentUser(deps.services.users));

  app.use('/api', healthRouter(deps.services.health));
  app.use('/api', authRouter(deps.services.users));
  app.use('/api', meRouter(deps.services.users));
  app.use('/api', organisationRouter(deps.services.organisations));
  app.use('/api', offerRouter(deps.services.offers));
  for (const router of deps.extraRouters ?? []) app.use(router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

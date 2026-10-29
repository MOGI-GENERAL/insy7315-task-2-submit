import express, { type Router } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { clientAddress, type ProxySettings } from './middleware/client-address.js';
import { csrfProtection } from './middleware/csrf.js';
import { loadCurrentUser } from './middleware/current-user.js';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { requirePasswordChanged } from './middleware/guards.js';
import type { RateLimitStoreFactory } from './middleware/rate-limit-store.js';
import { globalLimit } from './middleware/rate-limits.js';
import { securityHeaders } from './middleware/security-headers.js';
import { sessions, type SessionSettings } from './middleware/session.js';
import type { TwilioWebhookSettings } from './middleware/twilio-signature.js';
import { auditLogRouter } from './routes/audit-log-router.js';
import { authRouter } from './routes/auth-router.js';
import { certificateRouter } from './routes/certificate-router.js';
import { claimRouter } from './routes/claim-router.js';
import { collectionRouter } from './routes/collection-router.js';
import { handoverRouter } from './routes/handover-router.js';
import { healthRouter } from './routes/health-router.js';
import { meRouter } from './routes/me-router.js';
import { notificationRouter } from './routes/notification-router.js';
import { offerRouter } from './routes/offer-router.js';
import { openApiRouter } from './routes/openapi-router.js';
import { organisationRouter } from './routes/organisation-router.js';
import { reportRouter } from './routes/report-router.js';
import { userRouter } from './routes/user-router.js';
import { webhookRouter } from './routes/webhook-router.js';
import type { AuditService } from './services/audit-service.js';
import type { ClaimService } from './services/claim-service.js';
import type { CollectionService } from './services/collection-service.js';
import type { HandoverService } from './services/handover-service.js';
import type { HealthService } from './services/health-service.js';
import type { NotificationService } from './services/notification-service.js';
import type { OfferService } from './services/offer-service.js';
import type { OpenApiService } from './services/openapi-service.js';
import type { OrganisationService } from './services/organisation-service.js';
import type { ReportingService } from './services/reporting-service.js';
import type { UserService } from './services/user-service.js';
import type { WebhookService } from './services/webhook-service.js';

export interface AppServices {
  health: HealthService;
  openApi: OpenApiService;
  users: UserService;
  organisations: OrganisationService;
  offers: OfferService;
  claims: ClaimService;
  collections: CollectionService;
  handovers: HandoverService;
  notifications: NotificationService;
  reports: ReportingService;
  webhooks: WebhookService;
  audit: AuditService;
}

export interface AppDeps {
  logger: Logger;
  services: AppServices;
  session: SessionSettings;
  /** absent or null refuses every Twilio webhook */
  twilioWebhooks?: TwilioWebhookSettings | null;
  /** absent or null counts every request by the address that connected */
  proxy?: ProxySettings | null;
  /** absent keeps the sign-in and registration counts in memory */
  rateLimitStores?: RateLimitStoreFactory;
  /** lets tests mount throwaway routes in front of the 404 */
  extraRouters?: Router[];
}

/** Render's proxy. Netlify's hops are not counted, since a client can reach Render directly */
const TRUSTED_PROXY_HOPS = 1;

export function createApp(deps: AppDeps) {
  const app = express();

  app.set('trust proxy', TRUSTED_PROXY_HOPS);
  app.use(pinoHttp({ logger: deps.logger }));
  app.use(securityHeaders());
  app.use(clientAddress(deps.proxy ?? null));
  app.use(express.json({ limit: '100kb' }));

  app.use(sessions(deps.session));
  app.use(globalLimit());
  app.use(csrfProtection);
  app.use(loadCurrentUser(deps.services.users));
  app.use(requirePasswordChanged);

  app.use('/api', healthRouter(deps.services.health));
  app.use('/api', openApiRouter(deps.services.openApi));
  app.use('/api', authRouter(deps.services.users, deps.rateLimitStores));
  app.use('/api', meRouter(deps.services.users));
  app.use('/api', organisationRouter(deps.services.organisations));
  app.use('/api', offerRouter(deps.services.offers));
  app.use('/api', claimRouter(deps.services.claims));
  app.use('/api', collectionRouter(deps.services.collections));
  app.use('/api', handoverRouter(deps.services.handovers));
  app.use('/api', notificationRouter(deps.services.notifications));
  app.use('/api', reportRouter(deps.services.reports));
  app.use('/api', certificateRouter(deps.services.reports));
  app.use('/api', userRouter(deps.services.users));
  app.use('/api', auditLogRouter(deps.services.audit));
  app.use('/api', webhookRouter(deps.services.webhooks, deps.twilioWebhooks ?? null));
  for (const router of deps.extraRouters ?? []) app.use(router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

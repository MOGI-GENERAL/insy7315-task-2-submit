import express, { type Router } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFound } from './middleware/error-handler.js';
import { securityHeaders } from './middleware/security-headers.js';
import { healthRouter } from './routes/health-router.js';
import type { HealthService } from './services/health-service.js';

export interface AppServices {
  health: HealthService;
}

export interface AppDeps {
  logger: Logger;
  services: AppServices;
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

  // the session and then the CSRF check go here, so every router below sees both

  app.use('/api', healthRouter(deps.services.health));
  for (const router of deps.extraRouters ?? []) app.use(router);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

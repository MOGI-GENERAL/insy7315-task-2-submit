import type { NextFunction, Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RateLimitedError } from '../errors.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

function refuse(_req: Request, _res: Response, next: NextFunction) {
  next(new RateLimitedError());
}

/** depends on `trust proxy` naming the right hop, or every caller shares one address */
function clientIp(req: Request) {
  return ipKeyGenerator(req.ip ?? '');
}

/** runs before validation, so the email is normalised here the way the contract does it */
function loginEmail(req: Request) {
  return String(req.body?.email ?? '')
    .trim()
    .toLowerCase();
}

/** each limiter counts in its own memory, so call these once per app */
export function loginLimit() {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 5,
    keyGenerator: (req) => `${clientIp(req)} ${loginEmail(req)}`,
    // an account that keeps signing in from one network must never be locked out
    skipSuccessfulRequests: true,
    handler: refuse,
  });
}

export function registerLimit() {
  return rateLimit({
    windowMs: ONE_HOUR,
    limit: 10,
    keyGenerator: clientIp,
    handler: refuse,
  });
}

/**
 * counts per session once there is one, per address before that. health checks
 * and Twilio callbacks come in bulk from a few addresses, so they are skipped
 */
export function globalLimit() {
  return rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 300,
    keyGenerator: (req) =>
      req.session.userId || req.session.csrfToken ? `session ${req.sessionID}` : clientIp(req),
    skip: (req) => req.path === '/api/health' || req.path.startsWith('/api/webhooks/'),
    handler: refuse,
  });
}

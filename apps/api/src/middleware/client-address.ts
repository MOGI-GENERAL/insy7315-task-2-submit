import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { ForbiddenError } from '../errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** the address rate limits count by. set before any limiter runs */
    clientIp: string;
  }
}

/** Netlify signs every request its `/api` rewrite forwards, as an HS256 JWS */
export const NETLIFY_SIGNATURE_HEADER = 'x-nf-sign';
export const NETLIFY_CLIENT_IP_HEADER = 'x-nf-client-connection-ip';

/** Twilio and Render's health check call the API directly, never through Netlify */
const UNSIGNED_PATHS = ['/api/webhooks/twilio/', '/api/health'];

export interface ProxySettings {
  secret: string;
  /** refuse unsigned requests outside `UNSIGNED_PATHS` */
  required: boolean;
}

/** null when no secret is set, and every request is counted by the address that connected */
export function proxySettings(env: NodeJS.ProcessEnv, logger: Logger): ProxySettings | null {
  const secret = env.API_PROXY_SECRET;
  const required = env.API_PROXY_REQUIRED === 'true';
  if (!secret) {
    if (required) throw new Error('API_PROXY_REQUIRED is true but API_PROXY_SECRET is not set');
    logger.warn('API_PROXY_SECRET is not set, so requests through Netlify share its addresses');
    return null;
  }
  return { secret, required };
}

export function verifyNetlifySignature(token: string, secret: string, now = Date.now()) {
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [header, payload, signature] = parts as [string, string, string];

  const expected = createHmac('sha256', secret).update(`${header}.${payload}`).digest();
  const sent = Buffer.from(signature, 'base64url');
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return false;

  try {
    const { alg } = JSON.parse(Buffer.from(header, 'base64url').toString()) as { alg?: unknown };
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      iss?: unknown;
      exp?: unknown;
    };
    return (
      alg === 'HS256' &&
      claims.iss === 'netlify' &&
      typeof claims.exp === 'number' &&
      claims.exp * 1000 > now
    );
  } catch {
    return false;
  }
}

/**
 * Netlify's client address header is believed only on a signed request, since
 * anyone can send it to the Render address directly
 */
export function clientAddress(settings: ProxySettings | null) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.get(NETLIFY_SIGNATURE_HEADER);
    const signed = settings !== null && !!token && verifyNetlifySignature(token, settings.secret);

    if (signed) {
      const forwarded = req.get(NETLIFY_CLIENT_IP_HEADER);
      if (!forwarded) req.log.warn('a signed request from Netlify had no client address');
      req.clientIp = forwarded || (req.ip ?? '');
      next();
      return;
    }

    if (settings?.required && !UNSIGNED_PATHS.some((path) => req.path.startsWith(path))) {
      next(new ForbiddenError('Use the FEDSA web app address'));
      return;
    }
    req.clientIp = req.ip ?? '';
    next();
  };
}

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { CSRF_HEADER } from '@fedsa/contract';
import type { NextFunction, Request, Response } from 'express';
import { CsrfInvalidError } from '../errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Twilio cannot send a token. its requests are checked by signature instead */
const EXEMPT_PREFIX = '/api/webhooks/twilio/';

/** one token per session. signing in starts a new session, so the token changes with it */
export function issueCsrfToken(req: Request): string {
  req.session.csrfToken ??= randomBytes(32).toString('base64url');
  return req.session.csrfToken;
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || req.path.startsWith(EXEMPT_PREFIX)) {
    next();
    return;
  }

  const expected = req.session.csrfToken;
  const sent = req.get(CSRF_HEADER);
  if (!expected || !sent || !tokensMatch(sent, expected)) {
    next(new CsrfInvalidError());
    return;
  }
  next();
}

function tokensMatch(sent: string, expected: string) {
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

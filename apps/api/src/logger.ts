import { pino, type DestinationStream } from 'pino';

const REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  '*.*.password',
  '*.currentPassword',
  '*.newPassword',
  'passwordHash',
  '*.passwordHash',
  '*.*.passwordHash',
];

/** `destination` lets tests read what was logged */
export function createLogger(destination?: DestinationStream) {
  const options = { redact: { paths: REDACT, censor: '[redacted]' } };
  return destination ? pino(options, destination) : pino(options);
}

const DRIVER_LINK_TOKEN = /(\/(?:c|api\/driver-collections)\/)[A-Za-z0-9_-]{20,}/g;

/** a driver link's token is a credential. logs and stored texts show a placeholder */
export function hideDriverToken(text: string) {
  return text.replace(DRIVER_LINK_TOKEN, '$1[token]');
}

/** pino-http hands this the already serialised request. the referer has the page's token */
export function redactRequest<T extends { url: string; headers?: Record<string, unknown> }>(
  req: T,
) {
  req.url = hideDriverToken(req.url);
  const referer = req.headers?.referer;
  if (typeof referer === 'string')
    req.headers = { ...req.headers, referer: hideDriverToken(referer) };
  return req;
}

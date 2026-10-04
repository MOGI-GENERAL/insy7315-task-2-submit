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

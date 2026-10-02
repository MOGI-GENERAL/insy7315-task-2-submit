import { pino, type DestinationStream } from 'pino';

const REDACT = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  '*.*.password',
  '*.currentPassword',
  '*.newPassword',
];

/** `destination` lets tests read what was logged */
export function createLogger(destination?: DestinationStream) {
  const options = { redact: { paths: REDACT, censor: '[redacted]' } };
  return destination ? pino(options, destination) : pino(options);
}

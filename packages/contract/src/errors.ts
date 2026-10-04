import { z } from 'zod';

export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'CSRF_INVALID',
  'FORBIDDEN',
  'NOT_FOUND',
  'OFFER_UNAVAILABLE',
  'INVALID_STATE',
  'UPLOAD_REJECTED',
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  CSRF_INVALID: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  OFFER_UNAVAILABLE: 409,
  INVALID_STATE: 409,
  UPLOAD_REJECTED: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

/** `fields` is keyed by dotted input path, e.g. `organisation.contactPhone` */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    fields: z.record(z.string(), z.string()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

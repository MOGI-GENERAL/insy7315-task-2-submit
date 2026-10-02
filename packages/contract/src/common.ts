import { z } from 'zod';

export const CSRF_HEADER = 'X-CSRF-Token';
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';

export const objectId = z.string().regex(/^[0-9a-f]{24}$/, 'Must be a 24-character hex id');

/** a UTC instant with a trailing Z, as `Date.prototype.toISOString` gives */
export const isoDateTime = z.iso.datetime();

/** calendar day in South African time. ranges include both ends */
export const isoDay = z.iso.date();

export const e164Phone = z
  .string()
  .trim()
  .regex(/^\+[1-9][0-9]{7,14}$/, 'Use international format, for example +27821234567');

export const email = z.email().trim().toLowerCase().max(254);

export const shortText = z.string().trim().min(1).max(120);
export const longText = z.string().trim().max(1000);

export const quantityKg = z.number().positive().max(5000);

/** multipart fields arrive as strings */
export const quantityKgField = z.coerce.number().positive().max(5000);

export const idParams = z.object({ id: objectId });
export type IdParams = z.infer<typeof idParams>;

export const GeoPoint = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

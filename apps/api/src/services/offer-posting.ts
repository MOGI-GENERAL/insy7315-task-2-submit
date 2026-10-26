import { IDEMPOTENCY_HEADER } from '@fedsa/contract';
import { mongo, type Types } from 'mongoose';
import { z } from 'zod';
import type { OfferDoc, OfferRepository } from '../db/index.js';
import { ValidationError } from '../errors.js';

/** about 900,000 references exist, so a clash is rare and a few retries are plenty */
const MAX_REFERENCE_ATTEMPTS = 5;

const DUPLICATE_KEY = 11000;

/** a client UUID in practice */
const IdempotencyKey = z.string().trim().min(1).max(64);

export function isDuplicate(err: unknown, field: string) {
  return (
    err instanceof mongo.MongoServerError &&
    err.code === DUPLICATE_KEY &&
    field in (err.keyPattern ?? {})
  );
}

/** scoped to the donor, so one organisation's key can never return another's offer */
export function clientRequestId(donorId: Types.ObjectId, key: string | undefined) {
  if (key === undefined) return undefined;
  const parsed = IdempotencyKey.safeParse(key);
  if (!parsed.success) {
    throw new ValidationError({ [IDEMPOTENCY_HEADER]: 'Must be 1 to 64 characters' });
  }
  return `${donorId.toString()}:${parsed.data}`;
}

export async function createWithReference(
  offers: OfferRepository,
  newReference: () => string,
  data: Partial<OfferDoc>,
) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await offers.create({ ...data, reference: newReference() });
    } catch (err) {
      if (attempt >= MAX_REFERENCE_ATTEMPTS || !isDuplicate(err, 'reference')) throw err;
    }
  }
}

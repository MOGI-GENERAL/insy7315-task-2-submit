/** E.164, the only phone format Twilio accepts */
export const E164_PATTERN = '^\\+[1-9][0-9]{7,14}$';

/** plain http would be blocked as mixed content */
export const HTTPS_PATTERN = '^https://';

export const MAX_QUANTITY_KG = 5000;

/*
 * building blocks for the $jsonSchema validators. "number" matches int,
 * long, double and decimal, because the driver stores a whole number as int
 */
export const objectId = { bsonType: 'objectId' };
export const nullableObjectId = { bsonType: ['objectId', 'null'] };
export const date = { bsonType: 'date' };
export const nullableDate = { bsonType: ['date', 'null'] };
export const bool = { bsonType: 'bool' };

export function text(minLength: number, maxLength: number) {
  return { bsonType: 'string', minLength, maxLength };
}

export function nullableText(maxLength: number) {
  return { bsonType: ['string', 'null'], maxLength };
}

export function oneOf(values: readonly string[]) {
  return { enum: [...values] };
}

export function nullableOneOf(values: readonly string[]) {
  return { enum: [...values, null] };
}

/** MongoDB follows draft 4 here, where exclusiveMinimum is a flag on minimum */
export const positiveKg = {
  bsonType: 'number',
  minimum: 0,
  exclusiveMinimum: true,
  maximum: MAX_QUANTITY_KG,
};

export const timestamps = { createdAt: date, updatedAt: date };

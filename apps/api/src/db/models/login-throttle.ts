import { Schema, model, type InferSchemaType } from 'mongoose';
import { date, nullableDate, text } from '../rules.js';

/**
 * failed sign-ins for one email, from any address. keyed by a hash of the email.
 * unknown emails are counted too, without being stored
 */
const loginThrottleSchema = new Schema(
  {
    _id: { type: String, required: true, minlength: 64, maxlength: 64 },
    failures: { type: Number, required: true, min: 1 },
    blockedUntil: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { collection: 'login_throttles', versionKey: false, autoCreate: false, autoIndex: false },
);

loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const loginThrottleValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'LoginThrottle',
    required: ['_id', 'failures', 'expiresAt'],
    properties: {
      _id: text(64, 64),
      failures: { bsonType: 'number', minimum: 1 },
      blockedUntil: nullableDate,
      expiresAt: date,
    },
  },
};

export type LoginThrottleDoc = InferSchemaType<typeof loginThrottleSchema>;
export const LoginThrottleModel = model('LoginThrottle', loginThrottleSchema);

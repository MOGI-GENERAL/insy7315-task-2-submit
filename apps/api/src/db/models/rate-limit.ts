import { Schema, model, type InferSchemaType } from 'mongoose';
import { date, text } from '../rules.js';

/** one rate limit window per limiter and client. kept here so a restart does not reset the counts */
const rateLimitSchema = new Schema(
  {
    _id: { type: String, required: true, maxlength: 300 },
    hits: { type: Number, required: true, min: 0 },
    resetAt: { type: Date, required: true },
  },
  { collection: 'rate_limits', versionKey: false, autoCreate: false, autoIndex: false },
);

rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export const rateLimitValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'RateLimit',
    required: ['_id', 'hits', 'resetAt'],
    properties: {
      _id: text(1, 300),
      hits: { bsonType: 'number', minimum: 0 },
      resetAt: date,
    },
  },
};

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;
export const RateLimitModel = model('RateLimit', rateLimitSchema);

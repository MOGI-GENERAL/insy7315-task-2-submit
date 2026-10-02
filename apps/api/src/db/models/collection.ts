import { CollectionStatus } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { E164_PATTERN, date, nullableDate, objectId, oneOf, text, timestamps } from '../rules.js';

/**
 * transport for one claim. drivers have no accounts, so the driver is only
 * a name and a phone number here
 */
const collectionSchema = new Schema(
  {
    claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true },
    dispatchedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    driverName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    driverPhone: { type: String, required: true, match: new RegExp(E164_PATTERN) },
    dispatchedAt: { type: Date, required: true, default: Date.now },
    scheduledFor: { type: Date, default: null },
    status: { type: String, enum: CollectionStatus.options, required: true, default: 'dispatched' },
  },
  { collection: 'collections', timestamps: true, autoCreate: false, autoIndex: false },
);

export const collectionValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Collection',
    required: [
      'claimId',
      'dispatchedByUserId',
      'driverName',
      'driverPhone',
      'dispatchedAt',
      'status',
      'createdAt',
    ],
    properties: {
      claimId: objectId,
      dispatchedByUserId: objectId,
      driverName: text(2, 120),
      driverPhone: { bsonType: 'string', pattern: E164_PATTERN },
      dispatchedAt: date,
      scheduledFor: nullableDate,
      status: oneOf(CollectionStatus.options),
      ...timestamps,
    },
  },
};

export type CollectionDoc = InferSchemaType<typeof collectionSchema>;
export const CollectionModel = model('Collection', collectionSchema);

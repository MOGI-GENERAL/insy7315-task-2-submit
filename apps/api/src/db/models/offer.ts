import { ColdChain, FoodCategory, MAX_PHOTOS_PER_OFFER, OfferStatus } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  HTTPS_PATTERN,
  MAX_QUANTITY_KG,
  date,
  nullableDate,
  nullableObjectId,
  nullableText,
  objectId,
  oneOf,
  positiveKg,
  text,
  timestamps,
} from '../rules.js';

const offerSchema = new Schema(
  {
    donorOrganisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    postedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** short code a recipient quotes in a WhatsApp reply, e.g. "YES K4F2" */
    reference: { type: String, required: true, trim: true, maxlength: 20 },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, default: null, maxlength: 1000 },
    category: { type: String, enum: FoodCategory.options, required: true },
    offeredQuantityKg: {
      type: Number,
      required: true,
      validate: (v: number) => v > 0 && v <= MAX_QUANTITY_KG,
    },
    coldChain: { type: String, enum: ColdChain.options, required: true },
    /** capped at two to fit the Cloudinary storage budget */
    photoUrls: {
      type: [{ type: String, match: new RegExp(HTTPS_PATTERN) }],
      default: [],
      validate: (v: string[]) => v.length <= MAX_PHOTOS_PER_OFFER,
    },
    availableFrom: { type: Date, required: true },
    collectionDeadline: { type: Date, required: true },
    status: { type: String, enum: OfferStatus.options, required: true, default: 'open' },
    expiredAt: { type: Date, default: null },
    /** set only on the remainder spawned by a partial collection */
    parentOfferId: { type: Schema.Types.ObjectId, ref: 'Offer', default: null },
    /** the poster's Idempotency-Key. left unset otherwise, so the sparse index skips it */
    clientRequestId: { type: String, maxlength: 100 },
  },
  { collection: 'offers', timestamps: true, autoCreate: false, autoIndex: false },
);

offerSchema.index({ status: 1, collectionDeadline: 1 });
offerSchema.index({ donorOrganisationId: 1, createdAt: 1 });
offerSchema.index({ parentOfferId: 1 });
offerSchema.index({ reference: 1 }, { unique: true });
offerSchema.index({ clientRequestId: 1 }, { unique: true, sparse: true });

export const offerValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Offer',
    required: [
      'donorOrganisationId',
      'postedByUserId',
      'reference',
      'title',
      'category',
      'offeredQuantityKg',
      'coldChain',
      'availableFrom',
      'collectionDeadline',
      'status',
      'createdAt',
    ],
    properties: {
      donorOrganisationId: objectId,
      postedByUserId: objectId,
      reference: text(1, 20),
      title: text(3, 120),
      description: nullableText(1000),
      category: oneOf(FoodCategory.options),
      offeredQuantityKg: positiveKg,
      coldChain: oneOf(ColdChain.options),
      photoUrls: {
        bsonType: 'array',
        maxItems: MAX_PHOTOS_PER_OFFER,
        items: { bsonType: 'string', pattern: HTTPS_PATTERN },
      },
      availableFrom: date,
      collectionDeadline: date,
      status: oneOf(OfferStatus.options),
      expiredAt: nullableDate,
      parentOfferId: nullableObjectId,
      clientRequestId: text(1, 100),
      ...timestamps,
    },
  },
};

export type OfferDoc = InferSchemaType<typeof offerSchema>;
export const OfferModel = model('Offer', offerSchema);

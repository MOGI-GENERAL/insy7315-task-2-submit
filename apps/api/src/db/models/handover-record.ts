import { Condition } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import {
  HTTPS_PATTERN,
  MAX_QUANTITY_KG,
  date,
  nullableDate,
  nullableObjectId,
  nullableOneOf,
  nullableText,
  objectId,
  positiveKg,
  timestamps,
} from '../rules.js';

/**
 * the donor confirms first and the record exists from then on, so the
 * recipient fields stay null until the recipient confirms. append-only
 * once both sides have confirmed
 */
const handoverRecordSchema = new Schema(
  {
    claimId: { type: Schema.Types.ObjectId, ref: 'Claim', required: true },
    offerId: { type: Schema.Types.ObjectId, ref: 'Offer', required: true },
    donorConfirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    donorConfirmedAt: { type: Date, required: true },
    /** null once the retention sweep deletes the photo */
    donorPhotoUrl: { type: String, default: null, match: new RegExp(HTTPS_PATTERN) },
    /** what actually left the donor, and the figure reports use */
    collectedQuantityKg: {
      type: Number,
      required: true,
      validate: (v: number) => v > 0 && v <= MAX_QUANTITY_KG,
    },
    recipientConfirmedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    recipientConfirmedAt: { type: Date, default: null },
    conditionOnReceipt: { type: String, enum: [...Condition.options, null], default: null },
    conditionNotes: { type: String, default: null, maxlength: 1000 },
    retainUntil: { type: Date, required: true },
    /** write-once. a dispute is a `problem` handover the coordinator resolves */
    resolvedAt: { type: Date, default: null },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNote: { type: String, default: null, maxlength: 1000 },
  },
  { collection: 'handoverRecords', timestamps: true, autoCreate: false, autoIndex: false },
);

handoverRecordSchema.index({ retainUntil: 1 });
handoverRecordSchema.index({ claimId: 1 }, { unique: true });

export const handoverRecordValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'HandoverRecord',
    required: [
      'claimId',
      'offerId',
      'donorConfirmedByUserId',
      'donorConfirmedAt',
      'donorPhotoUrl',
      'collectedQuantityKg',
      'retainUntil',
      'createdAt',
    ],
    properties: {
      claimId: objectId,
      offerId: objectId,
      donorConfirmedByUserId: objectId,
      donorConfirmedAt: date,
      donorPhotoUrl: { bsonType: ['string', 'null'], pattern: HTTPS_PATTERN },
      collectedQuantityKg: positiveKg,
      recipientConfirmedByUserId: nullableObjectId,
      recipientConfirmedAt: nullableDate,
      conditionOnReceipt: nullableOneOf(Condition.options),
      conditionNotes: nullableText(1000),
      retainUntil: date,
      resolvedAt: nullableDate,
      resolvedByUserId: nullableObjectId,
      resolutionNote: nullableText(1000),
      ...timestamps,
    },
  },
};

export type HandoverRecordDoc = InferSchemaType<typeof handoverRecordSchema>;
export const HandoverRecordModel = model('HandoverRecord', handoverRecordSchema);

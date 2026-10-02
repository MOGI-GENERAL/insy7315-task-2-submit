import { ClaimStatus } from '@fedsa/contract';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { bool, date, nullableDate, nullableText, objectId, oneOf, timestamps } from '../rules.js';

const claimSchema = new Schema(
  {
    offerId: { type: Schema.Types.ObjectId, ref: 'Offer', required: true },
    recipientOrganisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', required: true },
    claimedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    claimedAt: { type: Date, required: true, default: Date.now },
    transportNeeded: { type: Boolean, required: true },
    status: { type: String, enum: ClaimStatus.options, required: true, default: 'active' },
    /** released claims are kept, so the release history stays visible */
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: null, maxlength: 1000 },
  },
  { collection: 'claims', timestamps: true, autoCreate: false, autoIndex: false },
);

claimSchema.index({ offerId: 1, status: 1 });
claimSchema.index({ recipientOrganisationId: 1, claimedAt: 1 });
/** at most one active claim per offer, even if the claim lock has a bug */
claimSchema.index(
  { offerId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'one_active_claim_per_offer',
  },
);

export const claimValidator = {
  $jsonSchema: {
    bsonType: 'object',
    title: 'Claim',
    required: [
      'offerId',
      'recipientOrganisationId',
      'claimedByUserId',
      'claimedAt',
      'transportNeeded',
      'status',
      'createdAt',
    ],
    properties: {
      offerId: objectId,
      recipientOrganisationId: objectId,
      claimedByUserId: objectId,
      claimedAt: date,
      transportNeeded: bool,
      status: oneOf(ClaimStatus.options),
      releasedAt: nullableDate,
      releaseReason: nullableText(1000),
      ...timestamps,
    },
  },
};

export type ClaimDoc = InferSchemaType<typeof claimSchema>;
export const ClaimModel = model('Claim', claimSchema);

import type { ClaimStatus } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { ClaimModel, type ClaimDoc } from '../models/claim.js';

export class ClaimRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return ClaimModel.findById(id, null, { session }).exec();
  }

  create(data: Partial<ClaimDoc>, session?: ClientSession) {
    return new ClaimModel(data).save({ session });
  }

  /** a released offer can be claimed again, so the newest claim is the active one if any is */
  latestForOffer(offerId: Types.ObjectId | string, recipientOrganisationId?: Types.ObjectId) {
    const filter = recipientOrganisationId ? { offerId, recipientOrganisationId } : { offerId };
    return ClaimModel.findOne(filter).sort({ claimedAt: -1, _id: -1 }).exec();
  }

  findActive(
    offerId: Types.ObjectId | string,
    recipientOrganisationId: Types.ObjectId | string,
    session?: ClientSession,
  ) {
    return ClaimModel.findOne({ offerId, recipientOrganisationId, status: 'active' }, null, {
      session,
    }).exec();
  }

  /** null if the claim is not active. a repeated release changes nothing */
  releaseIfActive(
    id: Types.ObjectId | string,
    reason: string | null,
    at: Date,
    session: ClientSession,
  ) {
    return ClaimModel.findOneAndUpdate(
      { _id: id, status: 'active' },
      { $set: { status: 'released', releasedAt: at, releaseReason: reason } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  findActiveForOffer(offerId: Types.ObjectId | string, session?: ClientSession) {
    return ClaimModel.findOne({ offerId, status: 'active' }, null, { session }).exec();
  }

  /** null if the claim is no longer active */
  fulfilIfActive(id: Types.ObjectId | string, session: ClientSession) {
    return ClaimModel.findOneAndUpdate(
      { _id: id, status: 'active' },
      { $set: { status: 'fulfilled' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  activeIdsForOffers(offerIds: Types.ObjectId[], session: ClientSession) {
    return ClaimModel.distinct('_id', { offerId: { $in: offerIds }, status: 'active' })
      .session(session)
      .exec() as Promise<Types.ObjectId[]>;
  }

  expireActive(ids: Types.ObjectId[], session: ClientSession) {
    return ClaimModel.updateMany(
      { _id: { $in: ids }, status: 'active' },
      { $set: { status: 'expired' } },
      { runValidators: true, session },
    ).exec();
  }

  /** newest first */
  list(filter: Record<string, unknown>, limit: number) {
    return ClaimModel.find(filter).sort({ claimedAt: -1, _id: -1 }).limit(limit).exec();
  }

  countByRecipient(recipientOrganisationId: Types.ObjectId | string, status?: ClaimStatus) {
    return ClaimModel.countDocuments(
      status ? { recipientOrganisationId, status } : { recipientOrganisationId },
    ).exec();
  }

  idsForRecipient(recipientOrganisationId: Types.ObjectId | string) {
    return ClaimModel.distinct('_id', { recipientOrganisationId }).exec() as Promise<
      Types.ObjectId[]
    >;
  }

  async hasFulfilled(recipientOrganisationId: Types.ObjectId | string) {
    const found = await ClaimModel.exists({ recipientOrganisationId, status: 'fulfilled' }).exec();
    return found !== null;
  }
}

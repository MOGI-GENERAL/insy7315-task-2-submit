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

import type { ClientSession, Types } from 'mongoose';
import { OfferModel, type OfferDoc } from '../models/offer.js';

export class OfferRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return OfferModel.findById(id, null, { session }).exec();
  }

  findByClientRequestId(clientRequestId: string) {
    return OfferModel.findOne({ clientRequestId }).exec();
  }

  create(data: Partial<OfferDoc>, session?: ClientSession) {
    return new OfferModel(data).save({ session });
  }

  /** newest first. `before` is the last ID of the previous page */
  list(filter: Record<string, unknown>, limit: number, before?: Types.ObjectId) {
    const query = before ? { $and: [filter, { _id: { $lt: before } }] } : filter;
    return OfferModel.find(query).sort({ _id: -1 }).limit(limit).exec();
  }

  /** null if the offer is no longer open, so a claim and a cancel cannot both win */
  cancelIfOpen(id: Types.ObjectId | string, session?: ClientSession) {
    return OfferModel.findOneAndUpdate(
      { _id: id, status: 'open' },
      { $set: { status: 'cancelled' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  /** the claim lock. the status filter is the lock, and a second claimant matches nothing */
  lockIfClaimable(id: Types.ObjectId | string, now: Date, session: ClientSession) {
    return OfferModel.findOneAndUpdate(
      { _id: id, status: 'open', availableFrom: { $lte: now }, collectionDeadline: { $gt: now } },
      { $set: { status: 'claimed' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  /** null if the offer is no longer claimed, as after expiry */
  reopenIfClaimed(id: Types.ObjectId | string, session: ClientSession) {
    return OfferModel.findOneAndUpdate(
      { _id: id, status: 'claimed' },
      { $set: { status: 'open' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  findByIds(ids: Types.ObjectId[]) {
    return OfferModel.find({ _id: { $in: ids } }).exec();
  }

  countByDonor(donorOrganisationId: Types.ObjectId | string) {
    return OfferModel.countDocuments({ donorOrganisationId }).exec();
  }

  idsForDonor(donorOrganisationId: Types.ObjectId | string) {
    return OfferModel.distinct('_id', { donorOrganisationId }).exec() as Promise<Types.ObjectId[]>;
  }
}

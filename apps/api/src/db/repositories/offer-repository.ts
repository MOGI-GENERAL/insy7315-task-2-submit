import type { OfferStatus } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { ClaimModel } from '../models/claim.js';
import { OfferModel, type OfferDoc } from '../models/offer.js';
import { ORGANISATION_ROWS, type KgRow } from './organisation-rows.js';

export interface OutcomeCounts {
  posted: number;
  open: number;
  claimed: number;
  collected: number;
  expiredUnclaimed: number;
  expiredClaimed: number;
  cancelled: number;
}

type DateRange = { $gte?: Date; $lt?: Date };

const NO_OUTCOMES: OutcomeCounts = {
  posted: 0,
  open: 0,
  claimed: 0,
  collected: 0,
  expiredUnclaimed: 0,
  expiredClaimed: 0,
  cancelled: 0,
};

const hasStatus = (status: OfferStatus) => ({ $eq: ['$status', status] });
const countWhere = (condition: object) => ({ $sum: { $cond: [condition, 1, 0] } });
const hadExpiredClaim = { $gt: [{ $size: '$expiredClaims' }, 0] };

export class OfferRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return OfferModel.findById(id, null, { session }).exec();
  }

  findByReference(reference: string) {
    return OfferModel.findOne({ reference }).exec();
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

  /**
   * null if the offer is no longer claimed or its deadline has passed. an overdue
   * offer stays claimed for the expiry sweep, since nobody could claim it again
   */
  reopenIfClaimed(id: Types.ObjectId | string, now: Date, session: ClientSession) {
    return OfferModel.findOneAndUpdate(
      { _id: id, status: 'claimed', collectionDeadline: { $gt: now } },
      { $set: { status: 'open' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  /** the status filter makes a second sweep match nothing */
  expireOpen(now: Date, session: ClientSession) {
    return OfferModel.updateMany(
      { status: 'open', collectionDeadline: { $lte: now } },
      { $set: { status: 'expired', expiredAt: now } },
      { runValidators: true, session },
    ).exec();
  }

  overdueClaimedIds(now: Date, session: ClientSession) {
    return OfferModel.distinct('_id', { status: 'claimed', collectionDeadline: { $lte: now } })
      .session(session)
      .exec() as Promise<Types.ObjectId[]>;
  }

  expireClaimed(ids: Types.ObjectId[], now: Date, session: ClientSession) {
    return OfferModel.updateMany(
      { _id: { $in: ids }, status: 'claimed' },
      { $set: { status: 'expired', expiredAt: now } },
      { runValidators: true, session },
    ).exec();
  }

  /** a real write. a release at the same moment conflicts with the caller's transaction */
  holdIfClaimed(id: Types.ObjectId | string, session: ClientSession) {
    return OfferModel.findOneAndUpdate(
      { _id: id, status: 'claimed' },
      { $set: { status: 'claimed' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  /** null if the offer is no longer claimed */
  collectIfClaimed(id: Types.ObjectId | string, session: ClientSession) {
    return OfferModel.findOneAndUpdate(
      { _id: id, status: 'claimed' },
      { $set: { status: 'collected' } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  /** the offer created for what was left behind, if any */
  findRemainderOf(parentOfferId: Types.ObjectId | string) {
    return OfferModel.findOne({ parentOfferId }).exec();
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

  /**
   * each offer posted within `range` by its current status. an expired offer whose
   * claim expired with it failed at collection, any other expired offer at matching
   */
  async outcomeCounts(range: DateRange): Promise<OutcomeCounts> {
    const [row] = await OfferModel.aggregate<OutcomeCounts>([
      { $match: { createdAt: range } },
      {
        $lookup: {
          from: ClaimModel.collection.collectionName,
          localField: '_id',
          foreignField: 'offerId',
          pipeline: [{ $match: { status: 'expired' } }, { $limit: 1 }, { $project: { _id: 1 } }],
          as: 'expiredClaims',
        },
      },
      {
        $group: {
          _id: null,
          posted: { $sum: 1 },
          open: countWhere(hasStatus('open')),
          claimed: countWhere(hasStatus('claimed')),
          collected: countWhere(hasStatus('collected')),
          expiredUnclaimed: countWhere({
            $and: [hasStatus('expired'), { $not: [hadExpiredClaim] }],
          }),
          expiredClaimed: countWhere({ $and: [hasStatus('expired'), hadExpiredClaim] }),
          cancelled: countWhere(hasStatus('cancelled')),
        },
      },
      { $project: { _id: 0 } },
    ]).exec();
    return row ?? NO_OUTCOMES;
  }

  /** recipient organisations with a fulfilled claim on an offer posted within `range` */
  async countRecipientsServed(range: DateRange) {
    const [row] = await OfferModel.aggregate<{ recipients: number }>([
      { $match: { createdAt: range } },
      {
        $lookup: {
          from: ClaimModel.collection.collectionName,
          localField: '_id',
          foreignField: 'offerId',
          pipeline: [
            { $match: { status: 'fulfilled' } },
            { $project: { recipientOrganisationId: 1 } },
          ],
          as: 'fulfilledClaims',
        },
      },
      { $unwind: '$fulfilledClaims' },
      { $group: { _id: '$fulfilledClaims.recipientOrganisationId' } },
      { $count: 'recipients' },
    ]).exec();
    return row?.recipients ?? 0;
  }

  /** a remainder's quantity is already inside its parent's. only offers with no parent are summed */
  offeredKgByDonor(range: DateRange) {
    return OfferModel.aggregate<KgRow>([
      { $match: { createdAt: range, parentOfferId: null } },
      { $group: { _id: '$donorOrganisationId', kg: { $sum: '$offeredQuantityKg' } } },
      ...ORGANISATION_ROWS,
    ]).exec();
  }
}

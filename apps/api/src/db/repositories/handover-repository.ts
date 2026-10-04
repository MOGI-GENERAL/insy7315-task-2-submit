import type { ImpactGroupBy } from '@fedsa/contract';
import type { ClientSession, PipelineStage, Types } from 'mongoose';
import { ClaimModel } from '../models/claim.js';
import { HandoverRecordModel } from '../models/handover-record.js';
import { OfferModel } from '../models/offer.js';
import { ORGANISATION_ROWS, type KgRow } from './organisation-rows.js';

/** the organisation each handover is grouped under, found through its offer or its claim */
const ORGANISATION_OF: Record<Exclude<ImpactGroupBy, 'month'>, PipelineStage[]> = {
  donor: [
    {
      $lookup: {
        from: OfferModel.collection.collectionName,
        localField: 'offerId',
        foreignField: '_id',
        pipeline: [{ $project: { donorOrganisationId: 1 } }],
        as: 'offer',
      },
    },
    { $set: { organisationId: { $first: '$offer.donorOrganisationId' } } },
  ],
  recipient: [
    {
      $lookup: {
        from: ClaimModel.collection.collectionName,
        localField: 'claimId',
        foreignField: '_id',
        pipeline: [{ $project: { recipientOrganisationId: 1 } }],
        as: 'claim',
      },
    },
    { $set: { organisationId: { $first: '$claim.recipientOrganisationId' } } },
  ],
};

export class HandoverRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return HandoverRecordModel.findById(id, null, { session }).exec();
  }

  findByClaim(claimId: Types.ObjectId | string, session?: ClientSession) {
    return HandoverRecordModel.findOne({ claimId }, null, { session }).exec();
  }

  /** only handovers both sides have confirmed count as collected */
  async totalCollectedKg(by: 'claimId' | 'offerId', ids: Types.ObjectId[]) {
    const [row] = await HandoverRecordModel.aggregate<{ kg: number }>([
      { $match: { [by]: { $in: ids }, recipientConfirmedAt: { $ne: null } } },
      { $group: { _id: null, kg: { $sum: '$collectedQuantityKg' } } },
    ]).exec();
    return row?.kg ?? 0;
  }

  /**
   * collected kilograms of the handovers the recipient confirmed within `range`.
   * the donor always confirms first, and the recipient's confirmation completes the pair
   */
  collectedKgBy(
    groupBy: ImpactGroupBy,
    range: { $gte?: Date; $lt?: Date },
    timezone: string,
  ): Promise<KgRow[]> {
    const match: PipelineStage = { $match: { recipientConfirmedAt: range } };

    if (groupBy === 'month') {
      return HandoverRecordModel.aggregate<KgRow>([
        match,
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: '$recipientConfirmedAt', timezone },
            },
            kg: { $sum: '$collectedQuantityKg' },
          },
        },
        { $project: { _id: 0, key: '$_id', label: '$_id', kg: 1 } },
        { $sort: { key: 1 } },
      ]).exec();
    }

    return HandoverRecordModel.aggregate<KgRow>([
      match,
      ...ORGANISATION_OF[groupBy],
      { $group: { _id: '$organisationId', kg: { $sum: '$collectedQuantityKg' } } },
      ...ORGANISATION_ROWS,
    ]).exec();
  }
}

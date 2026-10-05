import type { FoodCategory, ImpactGroupBy } from '@fedsa/contract';
import type { ClientSession, PipelineStage, Types } from 'mongoose';
import { ClaimModel } from '../models/claim.js';
import { HandoverRecordModel } from '../models/handover-record.js';
import { OfferModel } from '../models/offer.js';
import { OrganisationModel } from '../models/organisation.js';
import { TaxCertificateModel } from '../models/tax-certificate.js';
import { ORGANISATION_ROWS, type KgRow } from './organisation-rows.js';

/** a handover both sides confirmed, with its offer's category */
export interface CertifiableHandover {
  _id: Types.ObjectId;
  recipientConfirmedAt: Date;
  collectedQuantityKg: number;
  category: FoodCategory;
}

/** `day` is the day the recipient confirmed, as `YYYY-MM-DD` in the given timezone */
export interface ExportHandoverRow {
  day: string;
  donor: string;
  recipient: string;
  category: FoodCategory;
  kg: number;
  certificateNumber: string | null;
}

/** the impact report and the export both start here and always count the same handovers */
function collectedIn(range: { $gte?: Date; $lt?: Date }): PipelineStage {
  return { $match: { recipientConfirmedAt: range } };
}

function organisationName(localField: string, as: string): PipelineStage {
  return {
    $lookup: {
      from: OrganisationModel.collection.collectionName,
      localField,
      foreignField: '_id',
      pipeline: [{ $project: { name: 1 } }],
      as,
    },
  };
}

const OFFER_OF: PipelineStage[] = [
  {
    $lookup: {
      from: OfferModel.collection.collectionName,
      localField: 'offerId',
      foreignField: '_id',
      pipeline: [{ $project: { donorOrganisationId: 1, category: 1 } }],
      as: 'offer',
    },
  },
  { $set: { offer: { $first: '$offer' } } },
];

const CERTIFIABLE_FIELDS: PipelineStage[] = [
  { $project: { recipientConfirmedAt: 1, collectedQuantityKg: 1, category: '$offer.category' } },
  { $sort: { recipientConfirmedAt: 1, _id: 1 } },
];

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

  /**
   * the donor's handovers the recipient confirmed within `range`, except `excludeIds`.
   * a dispute counts only once a coordinator has resolved it
   */
  confirmedForDonor(
    donorOrganisationId: Types.ObjectId,
    range: { $gte?: Date; $lt?: Date },
    excludeIds: Types.ObjectId[],
    session: ClientSession,
  ) {
    return HandoverRecordModel.aggregate<CertifiableHandover>([
      {
        $match: {
          recipientConfirmedAt: range,
          _id: { $nin: excludeIds },
          $or: [{ conditionOnReceipt: { $ne: 'problem' } }, { resolvedAt: { $ne: null } }],
        },
      },
      ...OFFER_OF,
      { $match: { 'offer.donorOrganisationId': donorOrganisationId } },
      ...CERTIFIABLE_FIELDS,
    ])
      .session(session)
      .exec();
  }

  findCertifiable(ids: Types.ObjectId[]) {
    return HandoverRecordModel.aggregate<CertifiableHandover>([
      { $match: { _id: { $in: ids } } },
      ...OFFER_OF,
      ...CERTIFIABLE_FIELDS,
    ]).exec();
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
    const match = collectedIn(range);

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

  /** each handover `collectedKgBy` adds up, oldest first. no handover is on two certificates */
  collectedRows(
    range: { $gte?: Date; $lt?: Date },
    timezone: string,
  ): Promise<ExportHandoverRow[]> {
    return HandoverRecordModel.aggregate<ExportHandoverRow>([
      collectedIn(range),
      { $sort: { recipientConfirmedAt: 1, _id: 1 } },
      ...OFFER_OF,
      ...ORGANISATION_OF.recipient,
      organisationName('offer.donorOrganisationId', 'donor'),
      organisationName('organisationId', 'recipient'),
      {
        $lookup: {
          from: TaxCertificateModel.collection.collectionName,
          localField: '_id',
          foreignField: 'handoverRecordIds',
          pipeline: [{ $project: { certificateNumber: 1 } }],
          as: 'certificate',
        },
      },
      {
        $project: {
          _id: 0,
          day: { $dateToString: { format: '%Y-%m-%d', date: '$recipientConfirmedAt', timezone } },
          donor: { $ifNull: [{ $first: '$donor.name' }, ''] },
          recipient: { $ifNull: [{ $first: '$recipient.name' }, ''] },
          category: '$offer.category',
          kg: '$collectedQuantityKg',
          certificateNumber: { $ifNull: [{ $first: '$certificate.certificateNumber' }, null] },
        },
      },
    ]).exec();
  }
}

import type { ClientSession, Types } from 'mongoose';
import { HandoverRecordModel } from '../models/handover-record.js';

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
}

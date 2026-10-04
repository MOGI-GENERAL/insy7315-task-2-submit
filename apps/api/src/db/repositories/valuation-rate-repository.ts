import type { FoodCategory } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { ValuationRateModel } from '../models/valuation-rate.js';

export class ValuationRateRepository {
  list(session?: ClientSession) {
    return ValuationRateModel.find({}, null, { session }).exec();
  }

  findByCategory(category: FoodCategory, session?: ClientSession) {
    return ValuationRateModel.findOne({ category }, null, { session }).exec();
  }

  /** creates the rate if the category has none yet */
  set(
    category: FoodCategory,
    ratePerKg: number,
    updatedByUserId: Types.ObjectId,
    session: ClientSession,
  ) {
    return ValuationRateModel.findOneAndUpdate(
      { category },
      { $set: { ratePerKg, updatedByUserId } },
      { upsert: true, returnDocument: 'after', runValidators: true, session },
    ).exec();
  }
}

import type { ClientSession, Types } from 'mongoose';
import { OfferModel, type OfferDoc } from '../models/offer.js';

export class OfferRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return OfferModel.findById(id, null, { session }).exec();
  }

  create(data: Partial<OfferDoc>, session?: ClientSession) {
    return new OfferModel(data).save({ session });
  }

  countByDonor(donorOrganisationId: Types.ObjectId | string) {
    return OfferModel.countDocuments({ donorOrganisationId }).exec();
  }

  idsForDonor(donorOrganisationId: Types.ObjectId | string) {
    return OfferModel.distinct('_id', { donorOrganisationId }).exec() as Promise<Types.ObjectId[]>;
  }
}

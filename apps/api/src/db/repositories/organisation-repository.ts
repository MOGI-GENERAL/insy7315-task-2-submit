import type { ClientSession, Types } from 'mongoose';
import { OrganisationModel, type OrganisationDoc } from '../models/organisation.js';

export class OrganisationRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return OrganisationModel.findById(id, null, { session }).exec();
  }

  create(data: Partial<OrganisationDoc>, session?: ClientSession) {
    return new OrganisationModel(data).save({ session });
  }
}

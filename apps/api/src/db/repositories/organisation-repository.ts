import type { ClientSession, Types } from 'mongoose';
import { OrganisationModel } from '../models/organisation.js';

export class OrganisationRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return OrganisationModel.findById(id, null, { session }).exec();
  }
}

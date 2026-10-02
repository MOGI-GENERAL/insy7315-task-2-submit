import type { ClientSession, Types } from 'mongoose';
import { ClaimModel, type ClaimDoc } from '../models/claim.js';

export class ClaimRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return ClaimModel.findById(id, null, { session }).exec();
  }

  create(data: Partial<ClaimDoc>, session?: ClientSession) {
    return new ClaimModel(data).save({ session });
  }
}

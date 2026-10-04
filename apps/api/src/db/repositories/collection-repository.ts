import type { Types } from 'mongoose';
import { CollectionModel } from '../models/collection.js';

export class CollectionRepository {
  findByClaim(claimId: Types.ObjectId | string) {
    return CollectionModel.findOne({ claimId }).exec();
  }
}

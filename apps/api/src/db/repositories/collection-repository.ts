import type { CollectionStatus } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { CollectionModel, type CollectionDoc } from '../models/collection.js';

export class CollectionRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return CollectionModel.findById(id, null, { session }).exec();
  }

  findByClaim(claimId: Types.ObjectId | string, session?: ClientSession) {
    return CollectionModel.findOne({ claimId }, null, { session }).exec();
  }

  findByDriverTokenHash(hash: string) {
    return CollectionModel.findOne({ driverTokenHash: hash }).exec();
  }

  create(data: Partial<CollectionDoc>, session?: ClientSession) {
    return new CollectionModel(data).save({ session });
  }

  cancelDispatchedForClaims(claimIds: Types.ObjectId[], session: ClientSession) {
    return CollectionModel.updateMany(
      { claimId: { $in: claimIds }, status: 'dispatched' },
      { $set: { status: 'cancelled' } },
      { runValidators: true, session },
    ).exec();
  }

  /** null if the collection has already left `dispatched` */
  updateIfDispatched(
    id: Types.ObjectId | string,
    status: Exclude<CollectionStatus, 'dispatched'>,
    session: ClientSession,
  ) {
    return CollectionModel.findOneAndUpdate(
      { _id: id, status: 'dispatched' },
      { $set: { status } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  /** null if the collection has left `dispatched`. a reused hash throws a duplicate key error */
  replaceDriverTokenHash(id: Types.ObjectId | string, hash: string, session: ClientSession) {
    return CollectionModel.findOneAndUpdate(
      { _id: id, status: 'dispatched' },
      { $set: { driverTokenHash: hash } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }
}

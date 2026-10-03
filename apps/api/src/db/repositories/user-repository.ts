import type { ClientSession, Types } from 'mongoose';
import { UserModel, type UserDoc } from '../models/user.js';

export class UserRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return UserModel.findById(id, null, { session }).exec();
  }

  findByEmail(email: string) {
    return UserModel.findOne({ email }).exec();
  }

  create(data: Partial<UserDoc>, session?: ClientSession) {
    return new UserModel(data).save({ session });
  }

  recordLogin(id: Types.ObjectId | string) {
    return UserModel.findByIdAndUpdate(
      id,
      { $set: { lastLoginAt: new Date() } },
      { returnDocument: 'after' },
    ).exec();
  }

  updateProfile(id: Types.ObjectId | string, changes: Partial<UserDoc>) {
    return UserModel.findByIdAndUpdate(
      id,
      { $set: changes },
      { returnDocument: 'after', runValidators: true },
    ).exec();
  }

  updatePassword(id: Types.ObjectId | string, passwordHash: string) {
    return UserModel.updateOne(
      { _id: id },
      { $set: { passwordHash, mustChangePassword: false } },
    ).exec();
  }
}

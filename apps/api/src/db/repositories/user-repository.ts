import type { ClientSession, Types } from 'mongoose';
import { UserModel } from '../models/user.js';

export class UserRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return UserModel.findById(id, null, { session }).exec();
  }
}

import type { Role, UserStatus } from '@fedsa/contract';
import type { ClientSession, Types } from 'mongoose';
import { UserModel, type UserDoc } from '../models/user.js';
import { escapeRegex } from './organisation-repository.js';

export interface UserFilter {
  role?: Role;
  status?: UserStatus;
  /** matched against the full name and email in any case */
  q?: string;
}

export class UserRepository {
  list(filter: UserFilter) {
    const query: Record<string, unknown> = {};
    if (filter.role) query.role = filter.role;
    if (filter.status) query.status = filter.status;
    if (filter.q) {
      const pattern = new RegExp(escapeRegex(filter.q), 'i');
      query.$or = [{ fullName: pattern }, { email: pattern }];
    }
    return UserModel.find(query).sort({ fullName: 1, _id: 1 }).exec();
  }

  /** null if the role or status changed since it was read. push stops with the sessions */
  updateAccess(
    id: Types.ObjectId | string,
    from: { role: Role; status: UserStatus },
    changes: { role: Role; status: UserStatus },
    session?: ClientSession,
  ) {
    return UserModel.findOneAndUpdate(
      { _id: id, role: from.role, status: from.status },
      { $set: { ...changes, pushSubscriptions: [] } },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return UserModel.findById(id, null, { session }).exec();
  }

  findByEmail(email: string) {
    return UserModel.findOne({ email }).exec();
  }

  create(data: Partial<UserDoc>, session?: ClientSession) {
    return new UserModel(data).save({ session });
  }

  /** null if the account was disabled or its password changed after it was checked */
  recordLogin(id: Types.ObjectId | string, passwordHash: string) {
    return UserModel.findOneAndUpdate(
      { _id: id, status: 'active', passwordHash },
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
    return UserModel.findByIdAndUpdate(
      id,
      { $set: { passwordHash, mustChangePassword: false }, $inc: { passwordVersion: 1 } },
      { returnDocument: 'after' },
    ).exec();
  }

  /** null if the account was disabled or its password changed since it was read */
  resetPassword(
    id: Types.ObjectId | string,
    from: string,
    passwordHash: string,
    session?: ClientSession,
  ) {
    return UserModel.findOneAndUpdate(
      { _id: id, status: 'active', passwordHash: from },
      {
        $set: { passwordHash, mustChangePassword: true, pushSubscriptions: [] },
        $inc: { passwordVersion: 1 },
      },
      { returnDocument: 'after', runValidators: true, session },
    ).exec();
  }

  findActiveByIds(ids: (Types.ObjectId | string)[]) {
    return UserModel.find({ _id: { $in: ids }, status: 'active' })
      .sort({ _id: 1 })
      .exec();
  }

  /** staff of FEDSA have no organisation and are left out */
  findActiveOrganisationUsersByPhone(phone: string) {
    return UserModel.find({ phone, status: 'active', organisationId: { $ne: null } })
      .sort({ _id: 1 })
      .exec();
  }

  findActiveInOrganisations(organisationIds: (Types.ObjectId | string)[]) {
    return UserModel.find({ organisationId: { $in: organisationIds }, status: 'active' })
      .sort({ _id: 1 })
      .exec();
  }

  /** the oldest subscription drops off once a user has more than `max` */
  addPushSubscription(
    id: Types.ObjectId | string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    max: number,
  ) {
    return UserModel.updateOne(
      { _id: id },
      {
        $push: {
          pushSubscriptions: { $each: [{ ...subscription, createdAt: new Date() }], $slice: -max },
        },
      },
    ).exec();
  }

  removePushSubscription(id: Types.ObjectId | string, endpoint: string) {
    return UserModel.updateOne({ _id: id }, { $pull: { pushSubscriptions: { endpoint } } }).exec();
  }

  removePushEndpointFromEveryone(endpoint: string) {
    return UserModel.updateMany(
      { 'pushSubscriptions.endpoint': endpoint },
      { $pull: { pushSubscriptions: { endpoint } } },
    ).exec();
  }
}

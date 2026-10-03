import type { ClientSession, Types } from 'mongoose';
import { NotificationModel, type NotificationDoc } from '../models/notification.js';

/** the inbox shows only `in_app` rows, so a push or SMS copy never appears twice */
const INBOX = { channel: 'in_app' } as const;

export class NotificationRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return NotificationModel.findById(id, null, { session }).exec();
  }

  create(data: Partial<NotificationDoc>) {
    return new NotificationModel(data).save();
  }

  inbox(userId: Types.ObjectId | string, limit: number) {
    return NotificationModel.find({ userId, ...INBOX })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .exec();
  }

  countUnread(userId: Types.ObjectId | string) {
    return NotificationModel.countDocuments({ userId, ...INBOX, readAt: null }).exec();
  }

  findInInbox(id: Types.ObjectId | string, userId: Types.ObjectId | string) {
    return NotificationModel.findOne({ _id: id, userId, ...INBOX }).exec();
  }

  /** keeps the first read time if it was already read */
  markRead(id: Types.ObjectId | string) {
    return NotificationModel.updateOne(
      { _id: id, readAt: null },
      { $set: { readAt: new Date() } },
    ).exec();
  }
}

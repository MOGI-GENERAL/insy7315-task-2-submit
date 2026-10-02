import type { ClientSession, Types } from 'mongoose';
import { NotificationModel } from '../models/notification.js';

export class NotificationRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return NotificationModel.findById(id, null, { session }).exec();
  }
}

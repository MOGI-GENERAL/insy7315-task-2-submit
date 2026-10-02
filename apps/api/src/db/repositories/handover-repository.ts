import type { ClientSession, Types } from 'mongoose';
import { HandoverRecordModel } from '../models/handover-record.js';

export class HandoverRepository {
  findById(id: Types.ObjectId | string, session?: ClientSession) {
    return HandoverRecordModel.findById(id, null, { session }).exec();
  }
}

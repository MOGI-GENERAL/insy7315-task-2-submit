import type { ClientSession } from 'mongoose';
import { AuditLogModel, type AuditLogDoc } from '../models/audit-log.js';

export class AuditLogRepository {
  create(data: Partial<AuditLogDoc>, session?: ClientSession) {
    return new AuditLogModel(data).save({ session });
  }
}

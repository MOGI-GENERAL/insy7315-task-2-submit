import type { AuditAction } from '@fedsa/contract';
import type { ClientSession } from 'mongoose';
import { AuditLogModel, type AuditLogDoc } from '../models/audit-log.js';

export interface AuditLogFilter {
  action?: AuditAction;
  at?: { $gte?: Date; $lt?: Date };
}

export class AuditLogRepository {
  create(data: Partial<AuditLogDoc>, session?: ClientSession) {
    return new AuditLogModel(data).save({ session });
  }

  /** newest first */
  list(filter: AuditLogFilter) {
    const query: Record<string, unknown> = {};
    if (filter.action) query.action = filter.action;
    if (filter.at && Object.keys(filter.at).length > 0) query.at = filter.at;
    return AuditLogModel.find(query).sort({ at: -1, _id: -1 }).exec();
  }
}

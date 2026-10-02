import type { AuditAction } from '@fedsa/contract';
import { Types, type ClientSession } from 'mongoose';
import type { AuditLogRepository } from '../db/index.js';

type Id = Types.ObjectId | string;

export interface AuditTarget {
  /** the collection name, such as `organisations` */
  type: string;
  id: Id;
}

export interface AuditOptions {
  note?: string | null;
  /** pass the caller's transaction so the entry commits or rolls back with the action */
  session?: ClientSession;
}

export class AuditService {
  private readonly repository: AuditLogRepository;

  constructor(repository: AuditLogRepository) {
    this.repository = repository;
  }

  async record(userId: Id, action: AuditAction, target: AuditTarget, options: AuditOptions = {}) {
    await this.repository.create(
      {
        userId: new Types.ObjectId(userId),
        action,
        targetType: target.type,
        targetId: new Types.ObjectId(target.id),
        note: options.note ?? null,
      },
      options.session,
    );
  }
}

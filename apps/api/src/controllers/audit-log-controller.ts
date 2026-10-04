import type { AuditLogQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { AuditService } from '../services/audit-service.js';

export function auditLogController(audit: AuditService) {
  return {
    async list(req: Request, res: Response) {
      res.json(await audit.list(req.query as AuditLogQuery));
    },
  };
}

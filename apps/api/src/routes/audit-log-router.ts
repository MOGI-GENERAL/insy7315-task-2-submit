import { AuditLogQuery } from '@fedsa/contract';
import { Router } from 'express';
import { auditLogController } from '../controllers/audit-log-controller.js';
import { requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { AuditService } from '../services/audit-service.js';

export function auditLogRouter(audit: AuditService) {
  const controller = auditLogController(audit);
  const router = Router();
  router.get(
    '/audit-log',
    requireRole('administrator'),
    validate({ query: AuditLogQuery }),
    controller.list,
  );
  return router;
}

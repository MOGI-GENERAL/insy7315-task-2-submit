import { ImpactQuery, ReportRangeQuery } from '@fedsa/contract';
import { Router } from 'express';
import { reportController } from '../controllers/report-controller.js';
import { requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { ReportingService } from '../services/reporting-service.js';

export function reportRouter(reports: ReportingService) {
  const controller = reportController(reports);
  const router = Router();
  router.get(
    '/reports/impact',
    requireRole('administrator'),
    validate({ query: ImpactQuery }),
    controller.impact,
  );
  router.get(
    '/reports/outcomes',
    requireRole('administrator'),
    validate({ query: ReportRangeQuery }),
    controller.outcomes,
  );
  return router;
}

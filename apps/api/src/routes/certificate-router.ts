import {
  IssueCertificateRequest,
  ListCertificatesQuery,
  UpdateValuationRatesRequest,
  idParams,
} from '@fedsa/contract';
import { Router } from 'express';
import { certificateController } from '../controllers/certificate-controller.js';
import { requireOwnership, requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { ReportingService } from '../services/reporting-service.js';

export function certificateRouter(reports: ReportingService) {
  const controller = certificateController(reports);
  const ownCertificate = requireOwnership((req) => reports.certificateOwner(String(req.params.id)));
  const router = Router();
  router.get('/valuation-rates', requireRole('administrator'), controller.listRates);
  router.put(
    '/valuation-rates',
    requireRole('administrator'),
    validate({ body: UpdateValuationRatesRequest }),
    controller.updateRates,
  );
  router.post(
    '/tax-certificates',
    requireRole('administrator'),
    validate({ body: IssueCertificateRequest }),
    controller.issue,
  );
  router.get(
    '/tax-certificates',
    requireRole('donor', 'administrator'),
    validate({ query: ListCertificatesQuery }),
    controller.list,
  );
  router.get(
    '/tax-certificates/:id/pdf',
    requireRole('donor', 'administrator'),
    validate({ params: idParams }),
    ownCertificate,
    controller.pdf,
  );
  return router;
}

import {
  CapacityNotesRequest,
  ListOrganisationsQuery,
  UpdateDonorOrganisationRequest,
  UpdateRecipientOrganisationRequest,
  VerificationRequest,
  idParams,
} from '@fedsa/contract';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { organisationController } from '../controllers/organisation-controller.js';
import { requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { OrganisationService } from '../services/organisation-service.js';

/** strict, so a donor sending a recipient field is told so instead of having it dropped */
const PROFILE_VALIDATORS = {
  donor: validate({ body: UpdateDonorOrganisationRequest.strict() }),
  recipient: validate({ body: UpdateRecipientOrganisationRequest.strict() }),
};

/** the body has no discriminator, so the schema follows the caller's role */
function validateProfile(req: Request, res: Response, next: NextFunction) {
  PROFILE_VALIDATORS[req.user!.role as 'donor' | 'recipient'](req, res, next);
}

export function organisationRouter(organisations: OrganisationService) {
  const controller = organisationController(organisations);
  const router = Router();
  router.get('/organisations/me', requireRole('donor', 'recipient'), controller.getOwn);
  router.patch(
    '/organisations/me',
    requireRole('donor', 'recipient'),
    validateProfile,
    controller.updateOwn,
  );
  router.get(
    '/organisations',
    requireRole('coordinator', 'administrator'),
    validate({ query: ListOrganisationsQuery }),
    controller.list,
  );
  router.get(
    '/organisations/:id',
    requireRole('coordinator', 'administrator'),
    validate({ params: idParams }),
    controller.get,
  );
  router.post(
    '/organisations/:id/verification',
    requireRole('coordinator'),
    validate({ params: idParams, body: VerificationRequest }),
    controller.decide,
  );
  router.put(
    '/organisations/:id/notes',
    requireRole('coordinator'),
    validate({ params: idParams, body: CapacityNotesRequest }),
    controller.replaceNotes,
  );
  return router;
}

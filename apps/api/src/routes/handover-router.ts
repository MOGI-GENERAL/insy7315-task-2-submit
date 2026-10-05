import {
  DonorConfirmFields,
  ListHandoversQuery,
  RecipientConfirmRequest,
  ResolutionRequest,
  idParams,
} from '@fedsa/contract';
import { Router } from 'express';
import { handoverController } from '../controllers/handover-controller.js';
import { requireOwnership, requireRole } from '../middleware/guards.js';
import { acceptPhotos } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import type { HandoverService } from '../services/handover-service.js';

export function handoverRouter(handovers: HandoverService) {
  const controller = handoverController(handovers);
  const ownOffer = requireOwnership((req) => handovers.donorOf(String(req.params.id)));
  const ownClaim = requireOwnership((req) => handovers.claimantOf(String(req.params.id)));
  const router = Router();
  router.post(
    '/offers/:id/handover/donor-confirm',
    requireRole('donor'),
    acceptPhotos(['photo'], 1),
    validate({ params: idParams, body: DonorConfirmFields }),
    ownOffer,
    controller.donorConfirm,
  );
  router.post(
    '/offers/:id/handover/recipient-confirm',
    requireRole('recipient'),
    validate({ params: idParams, body: RecipientConfirmRequest }),
    ownClaim,
    controller.recipientConfirm,
  );
  router.get(
    '/handovers',
    requireRole('coordinator'),
    validate({ query: ListHandoversQuery }),
    controller.list,
  );
  router.post(
    '/handovers/:id/resolution',
    requireRole('coordinator'),
    validate({ params: idParams, body: ResolutionRequest }),
    controller.resolve,
  );
  router.get(
    '/handovers/:id/photo',
    requireRole('donor', 'recipient', 'coordinator', 'administrator'),
    validate({ params: idParams }),
    controller.photo,
  );
  return router;
}

import { ClaimRequest, ListClaimsQuery, ReleaseClaimRequest, idParams } from '@fedsa/contract';
import { Router } from 'express';
import { claimController } from '../controllers/claim-controller.js';
import { requireOwnership, requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { ClaimService } from '../services/claim-service.js';

export function claimRouter(claims: ClaimService) {
  const controller = claimController(claims);
  const ownClaim = requireOwnership((req) => claims.ownerOf(String(req.params.id)));
  const router = Router();
  router.post(
    '/offers/:id/claim',
    requireRole('recipient'),
    validate({ params: idParams, body: ClaimRequest }),
    controller.claim,
  );
  router.get(
    '/claims',
    requireRole('recipient', 'coordinator'),
    validate({ query: ListClaimsQuery }),
    controller.list,
  );
  router.post(
    '/claims/:id/release',
    requireRole('recipient'),
    validate({ params: idParams, body: ReleaseClaimRequest }),
    ownClaim,
    controller.release,
  );
  return router;
}

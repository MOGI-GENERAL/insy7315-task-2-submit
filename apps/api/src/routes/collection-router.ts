import {
  DispatchRequest,
  RotateDriverLinkRequest,
  UpdateCollectionRequest,
  idParams,
} from '@fedsa/contract';
import { Router } from 'express';
import { collectionController } from '../controllers/collection-controller.js';
import { requireRole } from '../middleware/guards.js';
import type { RateLimitStoreFactory } from '../middleware/rate-limit-store.js';
import { driverLinkLimit } from '../middleware/rate-limits.js';
import { validate } from '../middleware/validate.js';
import type { CollectionService } from '../services/collection-service.js';

export function collectionRouter(collections: CollectionService, stores?: RateLimitStoreFactory) {
  const controller = collectionController(collections);
  const router = Router();
  router.post(
    '/claims/:id/collection',
    requireRole('coordinator'),
    validate({ params: idParams, body: DispatchRequest }),
    controller.dispatch,
  );
  router.patch(
    '/collections/:id',
    requireRole('coordinator'),
    validate({ params: idParams, body: UpdateCollectionRequest }),
    controller.update,
  );
  router.put(
    '/collections/:id/driver-link',
    requireRole('coordinator'),
    validate({ params: idParams, body: RotateDriverLinkRequest }),
    controller.rotateDriverLink,
  );
  // the token is checked by the service, so a malformed one gets the same 404 as an unknown one
  router.get(
    '/driver-collections/:token',
    driverLinkLimit(stores?.('driver-link')),
    controller.driverView,
  );
  return router;
}

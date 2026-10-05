import { DispatchRequest, UpdateCollectionRequest, idParams } from '@fedsa/contract';
import { Router } from 'express';
import { collectionController } from '../controllers/collection-controller.js';
import { requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { CollectionService } from '../services/collection-service.js';

export function collectionRouter(collections: CollectionService) {
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
  return router;
}

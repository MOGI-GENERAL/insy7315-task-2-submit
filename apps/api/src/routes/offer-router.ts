import {
  CancelOfferRequest,
  ListOffersQuery,
  MAX_PHOTOS_PER_OFFER,
  PostOfferFields,
  idParams,
} from '@fedsa/contract';
import { Router } from 'express';
import { offerController } from '../controllers/offer-controller.js';
import { requireOwnership, requireRole } from '../middleware/guards.js';
import { acceptPhotos } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import type { OfferService } from '../services/offer-service.js';

/** `photos` is what a browser's `FormData` sends, `photos[]` how the field is often written */
const PHOTO_FIELDS = ['photos', 'photos[]'];

export function offerRouter(offers: OfferService) {
  const controller = offerController(offers);
  const ownOffer = requireOwnership((req) => offers.ownerOf(String(req.params.id)));
  const router = Router();
  router.post(
    '/offers',
    requireRole('donor'),
    acceptPhotos(PHOTO_FIELDS, MAX_PHOTOS_PER_OFFER),
    validate({ body: PostOfferFields }),
    controller.post,
  );
  router.get(
    '/offers',
    requireRole('donor', 'recipient', 'coordinator'),
    validate({ query: ListOffersQuery }),
    controller.list,
  );
  router.get(
    '/offers/:id',
    requireRole('donor', 'recipient', 'coordinator'),
    validate({ params: idParams }),
    controller.get,
  );
  router.post(
    '/offers/:id/cancel',
    requireRole('donor', 'coordinator'),
    validate({ params: idParams, body: CancelOfferRequest }),
    ownOffer,
    controller.cancel,
  );
  return router;
}

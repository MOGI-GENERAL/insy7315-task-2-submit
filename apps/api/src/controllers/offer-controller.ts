import { IDEMPOTENCY_HEADER, type ListOffersQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { OfferService } from '../services/offer-service.js';

/**
 * every route here sits behind `requireRole`, so `req.user` is set. posting
 * also sits behind `acceptPhotos`, which always sets `req.files`
 */
export function offerController(offers: OfferService) {
  return {
    async post(req: Request, res: Response) {
      res
        .status(201)
        .json(
          await offers.postOffer(
            req.user!,
            req.body,
            req.files as Express.Multer.File[],
            req.get(IDEMPOTENCY_HEADER),
          ),
        );
    },

    async list(req: Request, res: Response) {
      res.json(await offers.listOffers(req.user!, req.query as ListOffersQuery));
    },

    async get(req: Request, res: Response) {
      res.json(await offers.getOffer(req.user!, String(req.params.id)));
    },

    async cancel(req: Request, res: Response) {
      res.json(await offers.cancelOffer(req.user!, String(req.params.id), req.body));
    },
  };
}

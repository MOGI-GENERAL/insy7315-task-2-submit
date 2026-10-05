import type { ListHandoversQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { HandoverService } from '../services/handover-service.js';

/**
 * `requireRole` runs first on every route here. `req.user` is always set.
 * donor-confirm also sits behind `acceptPhotos`, which always sets `req.files`
 */
export function handoverController(handovers: HandoverService) {
  return {
    async donorConfirm(req: Request, res: Response) {
      const result = await handovers.donorConfirm(
        req.user!,
        String(req.params.id),
        req.body,
        req.files as Express.Multer.File[],
      );
      res.status(result.created ? 201 : 200).json(result.response);
    },

    async recipientConfirm(req: Request, res: Response) {
      res.json(await handovers.recipientConfirm(req.user!, String(req.params.id), req.body));
    },

    async list(req: Request, res: Response) {
      res.json(await handovers.list(req.query as ListHandoversQuery));
    },

    async resolve(req: Request, res: Response) {
      res.json(await handovers.resolve(req.user!, String(req.params.id), req.body));
    },

    async photo(req: Request, res: Response) {
      res.redirect(302, await handovers.photoUrl(req.user!, String(req.params.id)));
    },
  };
}

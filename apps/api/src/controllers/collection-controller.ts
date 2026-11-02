import type { Request, Response } from 'express';
import type { CollectionService } from '../services/collection-service.js';

/** `requireRole` runs first on every route here. `req.user` is always set */
export function collectionController(collections: CollectionService) {
  return {
    async dispatch(req: Request, res: Response) {
      const result = await collections.dispatch(req.user!, String(req.params.id), req.body);
      res.status(result.created ? 201 : 200).json(result.response);
    },

    async rotateDriverLink(req: Request, res: Response) {
      await collections.rotateDriverLink(req.user!, String(req.params.id), req.body);
      res.status(204).end();
    },

    async driverView(req: Request, res: Response) {
      res.json(await collections.driverView(String(req.params.token)));
    },

    async update(req: Request, res: Response) {
      res.json(await collections.update(req.user!, String(req.params.id), req.body));
    },
  };
}

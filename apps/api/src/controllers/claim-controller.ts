import type { ListClaimsQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { ClaimService } from '../services/claim-service.js';

/** `requireRole` runs first on every route here. `req.user` is always set */
export function claimController(claims: ClaimService) {
  return {
    async claim(req: Request, res: Response) {
      const result = await claims.claim(req.user!, String(req.params.id), req.body);
      res.status(result.created ? 201 : 200).json(result.response);
    },

    async list(req: Request, res: Response) {
      res.json(await claims.listClaims(req.user!, req.query as ListClaimsQuery));
    },

    async release(req: Request, res: Response) {
      res.json(await claims.release(String(req.params.id), req.body));
    },
  };
}

import type { ListOrganisationsQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { OrganisationService } from '../services/organisation-service.js';

/** every route here sits behind `requireRole`, so `req.user` is set */
export function organisationController(organisations: OrganisationService) {
  return {
    async getOwn(req: Request, res: Response) {
      res.json(await organisations.getOwn(req.user!.organisationId));
    },

    async updateOwn(req: Request, res: Response) {
      res.json(await organisations.updateOwn(req.user!.organisationId, req.body));
    },

    async list(req: Request, res: Response) {
      res.json(await organisations.list(req.query as ListOrganisationsQuery));
    },

    async get(req: Request, res: Response) {
      res.json(await organisations.get(String(req.params.id)));
    },

    async decide(req: Request, res: Response) {
      res.json(await organisations.decide(String(req.params.id), req.user!.id, req.body));
    },

    async replaceNotes(req: Request, res: Response) {
      res.json(await organisations.replaceNotes(String(req.params.id), req.user!.id, req.body));
    },
  };
}

import type { ListCertificatesQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { ReportingService } from '../services/reporting-service.js';

/** every route here sits behind `requireRole`. `req.user` is always set */
export function certificateController(reports: ReportingService) {
  return {
    async listRates(_req: Request, res: Response) {
      res.json(await reports.listRates());
    },

    async updateRates(req: Request, res: Response) {
      res.json(await reports.updateRates(req.user!.id, req.body));
    },

    async issue(req: Request, res: Response) {
      res.status(201).json(await reports.issueCertificate(req.user!.id, req.body));
    },

    async list(req: Request, res: Response) {
      res.json(await reports.listCertificates(req.user!, req.query as ListCertificatesQuery));
    },

    async pdf(req: Request, res: Response) {
      const { filename, pdf } = await reports.certificatePdf(String(req.params.id));
      res.type('application/pdf').attachment(filename).send(pdf);
    },
  };
}

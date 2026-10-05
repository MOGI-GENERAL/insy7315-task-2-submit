import type { ExportQuery, ImpactQuery, ReportRangeQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { ReportingService } from '../services/reporting-service.js';

export function reportController(reports: ReportingService) {
  return {
    async impact(req: Request, res: Response) {
      res.json(await reports.monthlyImpact(req.query as ImpactQuery));
    },

    async outcomes(req: Request, res: Response) {
      res.json(await reports.outcomes(req.query as ReportRangeQuery));
    },

    async exportFile(req: Request, res: Response) {
      const { filename, csv } = await reports.exportImpact(req.query as ExportQuery);
      res.type('text/csv').attachment(filename).send(csv);
    },
  };
}

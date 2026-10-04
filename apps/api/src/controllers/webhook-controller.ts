import type { Request, Response } from 'express';
import type { WebhookService } from '../services/webhook-service.js';

/** the signature check and validation run first on every route here */
export function webhookController(webhooks: WebhookService) {
  return {
    async inbound(req: Request, res: Response) {
      res.type('text/xml').send(await webhooks.answerReply(req.body));
    },

    async status(req: Request, res: Response) {
      await webhooks.recordDeliveryReport(req.body);
      res.status(204).end();
    },
  };
}

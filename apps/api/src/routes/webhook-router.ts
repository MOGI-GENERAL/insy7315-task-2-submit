import { TwilioInboundBody, TwilioStatusBody } from '@fedsa/contract';
import express, { Router } from 'express';
import { webhookController } from '../controllers/webhook-controller.js';
import { twilioSignature, type TwilioWebhookSettings } from '../middleware/twilio-signature.js';
import { validate } from '../middleware/validate.js';
import type { WebhookService } from '../services/webhook-service.js';

export function webhookRouter(webhooks: WebhookService, settings: TwilioWebhookSettings | null) {
  const controller = webhookController(webhooks);
  // Twilio posts forms. no other route accepts them
  const form = express.urlencoded({ extended: false, limit: '100kb' });
  const signed = twilioSignature(settings);
  const router = Router();
  router.post(
    '/webhooks/twilio/inbound',
    form,
    signed,
    validate({ body: TwilioInboundBody }),
    controller.inbound,
  );
  router.post(
    '/webhooks/twilio/status',
    form,
    signed,
    validate({ body: TwilioStatusBody }),
    controller.status,
  );
  return router;
}

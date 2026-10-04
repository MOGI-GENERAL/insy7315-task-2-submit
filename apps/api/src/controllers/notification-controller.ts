import type { Request, Response } from 'express';
import type { NotificationService } from '../services/notification-service.js';

/** every route here except the public key sits behind `requireAuth`, so `req.user` is set */
export function notificationController(notifications: NotificationService) {
  return {
    async list(req: Request, res: Response) {
      res.json(await notifications.listForUser(req.user!.id));
    },

    async markRead(req: Request, res: Response) {
      await notifications.markRead(req.user!.id, String(req.params.id));
      res.status(204).end();
    },

    async subscribe(req: Request, res: Response) {
      await notifications.addPushSubscription(req.user!.id, req.body);
      res.status(201).end();
    },

    async unsubscribe(req: Request, res: Response) {
      await notifications.removePushSubscription(req.user!.id, req.body.endpoint);
      res.status(204).end();
    },

    publicKey(_req: Request, res: Response) {
      res.json(notifications.publicKey());
    },
  };
}

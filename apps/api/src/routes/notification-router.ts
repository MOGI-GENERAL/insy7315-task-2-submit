import { DeletePushSubscriptionRequest, PushSubscriptionRequest, idParams } from '@fedsa/contract';
import { Router } from 'express';
import { notificationController } from '../controllers/notification-controller.js';
import { requireAuth } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { NotificationService } from '../services/notification-service.js';

export function notificationRouter(notifications: NotificationService) {
  const controller = notificationController(notifications);
  const router = Router();
  router.get('/notifications', requireAuth, controller.list);
  router.post(
    '/notifications/:id/read',
    requireAuth,
    validate({ params: idParams }),
    controller.markRead,
  );
  router.post(
    '/me/push-subscriptions',
    requireAuth,
    validate({ body: PushSubscriptionRequest }),
    controller.subscribe,
  );
  router.delete(
    '/me/push-subscriptions',
    requireAuth,
    validate({ body: DeletePushSubscriptionRequest }),
    controller.unsubscribe,
  );
  router.get('/push/public-key', controller.publicKey);
  return router;
}

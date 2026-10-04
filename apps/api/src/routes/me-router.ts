import { ChangePasswordRequest, UpdateMeRequest } from '@fedsa/contract';
import { Router } from 'express';
import { meController } from '../controllers/me-controller.js';
import { requireAuth } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { UserService } from '../services/user-service.js';

export function meRouter(users: UserService) {
  const controller = meController(users);
  const router = Router();
  router.get('/me', requireAuth, controller.get);
  router.patch('/me', requireAuth, validate({ body: UpdateMeRequest }), controller.update);
  router.post(
    '/me/password',
    requireAuth,
    validate({ body: ChangePasswordRequest }),
    controller.changePassword,
  );
  return router;
}

import { LoginRequest, RegisterRequest } from '@fedsa/contract';
import { Router } from 'express';
import { authController } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/guards.js';
import { loginLimit, registerLimit } from '../middleware/rate-limits.js';
import { validate } from '../middleware/validate.js';
import type { UserService } from '../services/user-service.js';

export function authRouter(users: UserService) {
  const controller = authController(users);
  const router = Router();
  router.get('/auth/csrf', controller.csrf);
  router.post(
    '/auth/register',
    registerLimit(),
    validate({ body: RegisterRequest }),
    controller.register,
  );
  router.post('/auth/login', loginLimit(), validate({ body: LoginRequest }), controller.login);
  router.post('/auth/logout', requireAuth, controller.logout);
  return router;
}

import { LoginRequest, RegisterRequest } from '@fedsa/contract';
import { Router } from 'express';
import { authController } from '../controllers/auth-controller.js';
import { requireAuth } from '../middleware/guards.js';
import type { RateLimitStoreFactory } from '../middleware/rate-limit-store.js';
import { loginAddressLimit, loginLimit, registerLimit } from '../middleware/rate-limits.js';
import { validate } from '../middleware/validate.js';
import type { UserService } from '../services/user-service.js';

export function authRouter(users: UserService, stores?: RateLimitStoreFactory) {
  const controller = authController(users);
  const router = Router();
  router.get('/auth/csrf', controller.csrf);
  router.post(
    '/auth/register',
    registerLimit(stores?.('register')),
    validate({ body: RegisterRequest }),
    controller.register,
  );
  router.post(
    '/auth/login',
    loginAddressLimit(stores?.('login-address')),
    loginLimit(stores?.('login')),
    validate({ body: LoginRequest }),
    controller.login,
  );
  router.post('/auth/logout', requireAuth, controller.logout);
  return router;
}

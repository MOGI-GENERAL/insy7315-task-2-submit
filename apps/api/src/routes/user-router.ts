import { CreateUserRequest, ListUsersQuery, UpdateUserRequest, idParams } from '@fedsa/contract';
import { Router } from 'express';
import { userController } from '../controllers/user-controller.js';
import { requireRole } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import type { UserService } from '../services/user-service.js';

export function userRouter(users: UserService) {
  const controller = userController(users);
  const router = Router();
  router.get(
    '/users',
    requireRole('administrator'),
    validate({ query: ListUsersQuery }),
    controller.list,
  );
  router.post(
    '/users',
    requireRole('administrator'),
    validate({ body: CreateUserRequest }),
    controller.create,
  );
  router.patch(
    '/users/:id',
    requireRole('administrator'),
    validate({ params: idParams, body: UpdateUserRequest }),
    controller.update,
  );
  router.post(
    '/users/:id/password-reset',
    requireRole('administrator'),
    validate({ params: idParams }),
    controller.resetPassword,
  );
  return router;
}

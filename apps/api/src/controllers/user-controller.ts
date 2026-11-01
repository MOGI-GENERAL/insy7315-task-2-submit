import type { ListUsersQuery } from '@fedsa/contract';
import type { Request, Response } from 'express';
import type { UserService } from '../services/user-service.js';

/** every route here sits behind `requireRole`, so `req.user` is set */
export function userController(users: UserService) {
  return {
    async list(req: Request, res: Response) {
      res.json(await users.listUsers(req.query as ListUsersQuery));
    },

    async create(req: Request, res: Response) {
      res.status(201).json(await users.createUser(req.user!.id, req.body));
    },

    async update(req: Request, res: Response) {
      res.json(await users.updateUser(req.user!.id, String(req.params.id), req.body));
    },

    async resetPassword(req: Request, res: Response) {
      res.json(await users.resetPassword(req.user!.id, String(req.params.id)));
    },
  };
}

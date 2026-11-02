import type { Request, Response } from 'express';
import type { UserService } from '../services/user-service.js';

/** every route here sits behind `requireAuth`, so `req.user` is set */
export function meController(users: UserService) {
  return {
    async get(req: Request, res: Response) {
      res.json(await users.getSession(req.user!.id));
    },

    async update(req: Request, res: Response) {
      res.json(await users.updateMe(req.user!.id, req.body));
    },

    async changePassword(req: Request, res: Response) {
      req.session.passwordVersion = await users.changePassword(
        req.user!.id,
        req.body,
        req.sessionID,
      );
      res.status(204).end();
    },
  };
}

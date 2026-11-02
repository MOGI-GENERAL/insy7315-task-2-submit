import type { CsrfResponse } from '@fedsa/contract';
import type { Request, Response } from 'express';
import { issueCsrfToken } from '../middleware/csrf.js';
import { signIn, signOut } from '../middleware/session.js';
import type { UserService } from '../services/user-service.js';

export function authController(users: UserService) {
  return {
    csrf(req: Request, res: Response) {
      const body: CsrfResponse = { csrfToken: issueCsrfToken(req) };
      res.json(body);
    },

    async register(req: Request, res: Response) {
      const { body, passwordVersion } = await users.register(req.body);
      await signIn(req, body.user.id, passwordVersion);
      res.status(201).json(body);
    },

    async login(req: Request, res: Response) {
      const { body, passwordVersion } = await users.login(req.body);
      await signIn(req, body.user.id, passwordVersion);
      res.json(body);
    },

    async logout(req: Request, res: Response) {
      await signOut(req, res);
      res.status(204).end();
    },
  };
}

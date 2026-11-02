import type { NextFunction, Request, Response } from 'express';
import type { SessionUser, UserService } from '../services/user-service.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** set only for an active user. absent means the request is anonymous */
    user?: SessionUser;
  }
}

/**
 * the user is read on every request. a disable, a role change or a new password
 * applies to sessions already open
 */
export function loadCurrentUser(users: UserService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const { userId, passwordVersion = 0 } = req.session;
    if (userId) req.user = (await users.findSessionUser(userId, passwordVersion)) ?? undefined;
    next();
  };
}

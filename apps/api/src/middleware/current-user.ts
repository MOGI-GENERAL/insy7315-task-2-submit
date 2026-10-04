import type { NextFunction, Request, Response } from 'express';
import type { SessionUser, UserService } from '../services/user-service.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** set only for an active user. absent means the request is anonymous */
    user?: SessionUser;
  }
}

/**
 * reads the role, status and organisation from the database on every request,
 * so disabling a user or changing their role applies to sessions already open
 */
export function loadCurrentUser(users: UserService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = req.session.userId;
    if (userId) req.user = (await users.findSessionUser(userId)) ?? undefined;
    next();
  };
}

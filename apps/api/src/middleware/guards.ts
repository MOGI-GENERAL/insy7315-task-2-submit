import type { Role } from '@fedsa/contract';
import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import { ForbiddenError, NotFoundError, UnauthenticatedError } from '../errors.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new UnauthenticatedError());
    return;
  }
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthenticatedError());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError());
      return;
    }
    next();
  };
}

/** resolves to the ID of the organisation that owns the target record, or null if there is none */
export type OwnerLoader = (req: Request) => Promise<Types.ObjectId | string | null | undefined>;

/**
 * another organisation's record gets the same 404 as a missing one. FEDSA staff
 * have no organisation and pass, so `requireRole` decides what they may do
 */
export function requireOwnership(loadOwner: OwnerLoader) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new UnauthenticatedError();
    if (req.user.organisationId === null) {
      next();
      return;
    }

    const owner = await loadOwner(req);
    if (!owner || owner.toString() !== req.user.organisationId) throw new NotFoundError();
    next();
  };
}

/** all a user signed in with a temporary password can reach until they replace it */
const BEFORE_PASSWORD_CHANGE = new Set([
  'GET /api/auth/csrf',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'GET /api/me',
  'POST /api/me/password',
]);

export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.mustChangePassword && !BEFORE_PASSWORD_CHANGE.has(`${req.method} ${req.path}`)) {
    next(new ForbiddenError('Change your temporary password first'));
    return;
  }
  next();
}

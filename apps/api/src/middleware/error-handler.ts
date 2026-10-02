import type { ErrorEnvelope } from '@fedsa/contract';
import type { NextFunction, Request, Response } from 'express';
import { AppError, NotFoundError, ValidationError } from '../errors.js';

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new NotFoundError());
}

/** an unexpected error is logged in full and reaches the client as a bare 500 */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    next(err);
    return;
  }

  let appError = toAppError(err);
  if (!appError) {
    req.log.error({ err }, 'unhandled error');
    appError = new AppError('INTERNAL', 'Something went wrong. Try again');
  }

  const body: ErrorEnvelope = { error: { code: appError.code, message: appError.message } };
  if (appError.fields) body.error.fields = appError.fields;
  res.status(appError.status).json(body);
}

/** keyed by the `type` the JSON body parser puts on its errors */
const BODY_ERRORS: Record<string, string> = {
  'entity.too.large': 'The request body is too large',
  'entity.parse.failed': 'The request body is not valid JSON',
};

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (!(err instanceof Error) || !('status' in err) || typeof err.status !== 'number') return null;
  if (err.status >= 500) return null;

  const type = 'type' in err && typeof err.type === 'string' ? err.type : '';
  return new ValidationError(undefined, BODY_ERRORS[type] ?? 'The request could not be read');
}

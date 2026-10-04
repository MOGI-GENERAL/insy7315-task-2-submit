import { ERROR_STATUS, type ErrorCode } from '@fedsa/contract';

/** an expected failure. the error handler sends it to the client as it is */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields: Record<string, string> | undefined;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.fields = fields;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export class ValidationError extends AppError {
  constructor(fields?: Record<string, string>, message = 'Some fields are not valid') {
    super('VALIDATION_FAILED', message, fields);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Sign in to continue') {
    super('UNAUTHENTICATED', message);
  }
}

export class CsrfInvalidError extends AppError {
  constructor(message = 'Reload the page and try again') {
    super('CSRF_INVALID', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this') {
    super('FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super('NOT_FOUND', message);
  }
}

export class OfferUnavailableError extends AppError {
  constructor(message = 'This offer has already been claimed') {
    super('OFFER_UNAVAILABLE', message);
  }
}

export class InvalidStateError extends AppError {
  constructor(message = 'This action is not allowed in the current state') {
    super('INVALID_STATE', message);
  }
}

export class UploadRejectedError extends AppError {
  constructor(message = 'The upload was rejected') {
    super('UPLOAD_REJECTED', message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many attempts. Wait a few minutes and try again') {
    super('RATE_LIMITED', message);
  }
}

import { ERROR_STATUS, type ErrorCode, type ErrorEnvelope } from '@fedsa/contract';

/** the one error type every repository rejects with, fake or real */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string>;

  constructor(code: ErrorCode, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.fields = fields;
  }

  static fromEnvelope(envelope: ErrorEnvelope): ApiError {
    const { code, message, fields } = envelope.error;
    return new ApiError(code, message, fields);
  }
}

export function isApiError(error: unknown, code?: ErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

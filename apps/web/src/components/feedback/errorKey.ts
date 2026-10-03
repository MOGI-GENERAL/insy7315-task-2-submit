import type { ErrorCode } from '@fedsa/contract';
import { isApiError } from '../../data/ApiError';
import type { StringKey } from '../../i18n/strings';

const byCode: Record<ErrorCode, StringKey> = {
  VALIDATION_FAILED: 'error.validation',
  UNAUTHENTICATED: 'error.unauthenticated',
  CSRF_INVALID: 'error.csrf',
  FORBIDDEN: 'error.forbidden',
  NOT_FOUND: 'error.notFound',
  OFFER_UNAVAILABLE: 'error.offerUnavailable',
  INVALID_STATE: 'error.invalidState',
  UPLOAD_REJECTED: 'error.uploadRejected',
  RATE_LIMITED: 'error.rateLimited',
  INTERNAL: 'error.internal',
};

/** server messages are English only. the user sees a translated message for the code */
export function errorKey(error: unknown): StringKey {
  if (isApiError(error)) return byCode[error.code];
  // fetch rejects with a TypeError when the phone has no signal
  if (error instanceof TypeError) return 'error.network';
  return 'error.internal';
}

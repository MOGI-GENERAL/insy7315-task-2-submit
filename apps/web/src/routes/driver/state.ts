import type { DriverCollectionResponse } from '@fedsa/contract';
import { isApiError } from '../../data/ApiError';
import type { Loaded } from '../../data/useLoad';

export type DriverState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: DriverCollectionResponse }
  // every dead link answers 404 and looks the same
  | { kind: 'gone' }
  | { kind: 'failed' };

export function driverState(result: Loaded<DriverCollectionResponse>): DriverState {
  if (result.loading) return { kind: 'loading' };
  if (result.error) {
    return isApiError(result.error, 'NOT_FOUND') ? { kind: 'gone' } : { kind: 'failed' };
  }
  return result.data ? { kind: 'ready', data: result.data } : { kind: 'loading' };
}

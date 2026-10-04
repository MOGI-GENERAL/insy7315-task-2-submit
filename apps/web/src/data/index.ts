import type { Store } from '../store/store';
import { createFakeDataLayer } from './fake';
import { createHttpDataLayer } from './http';
import type { DataLayer } from './repositories';

export { ApiError, isApiError } from './ApiError';
export { photoKeyFromUrl } from './fake/mappers';
export { demoAccounts } from './fake/demoAccounts';
export type { DemoAccount } from './fake/demoAccounts';
export { useLoad } from './useLoad';
export type { Loaded } from './useLoad';
export type * from './repositories';

export type DataMode = 'fake' | 'http';

export function dataMode(): DataMode {
  return import.meta.env.VITE_DATA === 'http' ? 'http' : 'fake';
}

/** `?fail=claim,post` makes those calls reject, to show the error states on demand */
function failOnFromUrl(): Set<string> {
  const fail = new URLSearchParams(window.location.search).get('fail');
  return new Set(fail ? fail.split(',').map((s) => s.trim()) : []);
}

export function createDataLayer(store: Store): DataLayer {
  if (dataMode() === 'http') return createHttpDataLayer();
  return createFakeDataLayer(store, {
    delayMs: Number(import.meta.env.VITE_FAKE_DELAY_MS ?? 400),
    failOn: failOnFromUrl(),
  });
}

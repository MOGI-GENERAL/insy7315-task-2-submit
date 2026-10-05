import type { DemoAccount } from './fake/demoAccounts';
import { createHttpDataLayer } from './http';
import type { DataLayer } from './repositories';

export { ApiError, isApiError } from './ApiError';
export { photoKeyFromUrl } from './fake/mappers';
export type { DemoAccount } from './fake/demoAccounts';
export { useData } from './context';
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

/** filled before the first render in fake mode, and left empty in HTTP mode */
export const demoAccounts: DemoAccount[] = [];

/** reading the variable here, not through `dataMode()`, lets the HTTP build drop the fake and its demo data */
export async function createDataLayer(): Promise<DataLayer> {
  if (import.meta.env.VITE_DATA === 'http') return createHttpDataLayer();
  const [{ createFakeDataLayer }, { createStore }, demo] = await Promise.all([
    import('./fake'),
    import('../store/store'),
    import('./fake/demoAccounts'),
  ]);
  demoAccounts.push(...demo.demoAccounts);
  return createFakeDataLayer(createStore(), {
    delayMs: Number(import.meta.env.VITE_FAKE_DELAY_MS ?? 400),
    failOn: failOnFromUrl(),
  });
}

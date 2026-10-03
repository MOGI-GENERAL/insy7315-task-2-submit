import { useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { AppContext } from './context';
import type { Store } from './store';

/** IN-MEMORY STATE ONLY - NO PERSISTENCE BY DESIGN, REFRESH RESETS DEMO */
export function AppProvider({ store, children }: { store: Store; children: ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const value = useMemo(() => ({ state, dispatch: store.dispatch }), [state, store]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

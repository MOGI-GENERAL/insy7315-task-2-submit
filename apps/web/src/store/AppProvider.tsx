import { useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import { AppContext } from './context';
import { reducer } from './reducer';
import { createInitialState } from './seed';

/** IN-MEMORY STATE ONLY - NO PERSISTENCE BY DESIGN, REFRESH RESETS DEMO */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

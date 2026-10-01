/* CONTEXT + HOOKS, SEPARATE FROM PROVIDER SO FAST REFRESH STAYS HAPPY */

import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';
import type { AppState } from './types';
import type { Action } from './reducer';
import { currentOrg, currentUser } from './selectors';

export interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

export function useAppState(): AppState {
  return useApp().state;
}

export function useDispatch(): Dispatch<Action> {
  return useApp().dispatch;
}

/** SIGNED-IN USER, OR NULL AT LOGIN */
export function useCurrentUser() {
  return currentUser(useApp().state);
}

/** CURRENT USER'S ORG (FEDSA STAFF HAVE NONE) */
export function useCurrentOrg() {
  return currentOrg(useApp().state);
}

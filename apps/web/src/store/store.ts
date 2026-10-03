import { fakeReducer, isFakeAction, type FakeAction } from '../data/fake/actions';
import { reducer, type Action } from './reducer';
import { createInitialState } from './seed';
import type { AppState } from './types';

export interface Store {
  getState(): AppState;
  dispatch(action: Action | FakeAction): void;
  subscribe(listener: () => void): () => void;
}

/** the reducer outside React. the fake repositories and the screens share its state */
export function createStore(initial: AppState = createInitialState()): Store {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch(action) {
      const next = isFakeAction(action) ? fakeReducer(state, action) : reducer(state, action);
      if (next === state) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

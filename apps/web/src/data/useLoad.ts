import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';

export interface Loaded<T> {
  /** kept from the last success during a reload */
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * runs `load` on mount and whenever `deps` change. ESLint checks `deps` like `useEffect`.
 * `refreshMs` polls quietly, as the coordinator dashboard needs (US14)
 */
export function useLoad<T>(
  load: () => Promise<T>,
  deps: DependencyList,
  { refreshMs }: { refreshMs?: number } = {},
): Loaded<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(load);
  const generation = useRef(0);

  useEffect(() => {
    latest.current = load;
  });

  const run = useCallback(async (quiet: boolean) => {
    const mine = ++generation.current;
    if (!quiet) setLoading(true);
    try {
      const result = await latest.current();
      // a slower earlier request must not overwrite a newer one
      if (mine !== generation.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (mine !== generation.current) return;
      if (!quiet) setError(e);
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    // new deps mean the shown data is stale, and the spinner has to appear in the same render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run(false);
    // the caller's deps stand in for `load`, which is a new function every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!refreshMs) return;
    const timer = setInterval(() => void run(true), refreshMs);
    return () => clearInterval(timer);
  }, [refreshMs, run]);

  const reload = useCallback(() => run(false), [run]);
  return { data, error, loading, reload };
}

import { ReportRangeQuery } from '@fedsa/contract';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const saDay = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Africa/Johannesburg' });

/** the first of the month five months back, so six months show */
function defaultFrom() {
  const now = new Date();
  return saDay(new Date(now.getFullYear(), now.getMonth() - 5, 1, 12));
}

/** the period lives in the URL, so a link between reports carries it */
export function useRange() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? defaultFrom();
  const to = params.get('to') ?? saDay(new Date());
  const range = useMemo(() => {
    const parsed = ReportRangeQuery.safeParse({ from, to });
    return parsed.success ? parsed.data : null;
  }, [from, to]);

  const set = (key: 'from' | 'to', value: string) => {
    if (!value) return;
    const next = new URLSearchParams(params);
    next.set('from', from);
    next.set('to', to);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return {
    from,
    to,
    range,
    search: `?${new URLSearchParams({ from, to }).toString()}`,
    setFrom: (value: string) => set('from', value),
    setTo: (value: string) => set('to', value),
  };
}

export type Range = ReturnType<typeof useRange>;

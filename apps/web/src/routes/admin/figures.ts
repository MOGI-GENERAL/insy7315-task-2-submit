import type { ImpactRow } from '@fedsa/contract';
import { formatMonth } from '../../lib/format';

/** the API sends the month as `YYYY-MM` for both key and label */
export const monthLabel = (key: string) => formatMonth(`${key}-15T12:00:00+02:00`);

export const byMonthAscending = (rows: ImpactRow[]) =>
  [...rows].sort((a, b) => a.key.localeCompare(b.key));

/** `claimedPct` arrives as a percentage with one decimal */
export const formatPct = (pct: number) => `${pct.toLocaleString('en-ZA')}%`;

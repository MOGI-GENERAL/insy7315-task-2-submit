/* SA FORMATTING: 24H CLOCK, DAY-MONTH ORDER, RAND, PLAIN TIME (NEVER "5.30PM") */

import { KG_PER_MEAL } from '@fedsa/contract';

export { KG_PER_MEAL };

const LOCALE = 'en-ZA';

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    month: 'short',
    year: 'numeric',
  });
}

/** RELATIVE DAY LABEL + TIME, WHICHEVER READS BEST */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((midnight(d) - midnight(now)) / 86_400_000);
  const time = formatTime(iso);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days === -1) return `Yesterday ${time}`;
  return `${formatDate(iso)} ${time}`;
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatKg(kg: number): string {
  const rounded = Math.round(kg * 10) / 10;
  return `${rounded.toLocaleString(LOCALE)} kg`;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString(LOCALE);
}

/** the API's rule. counted in whole grams, as 1.2 / 0.4 is 2.9999 */
export function mealsFromKg(kg: number): number {
  return Math.floor(Math.round(kg * 1000) / Math.round(KG_PER_MEAL * 1000));
}

export function formatZar(amount: number): string {
  return `R${Math.round(amount).toLocaleString(LOCALE)}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** TIME LEFT UNTIL DEADLINE; NULL ONCE PASSED */
export function timeLeft(iso: string, from: Date = new Date()): string | null {
  const ms = new Date(iso).getTime() - from.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours} h ${minutes} min left`;
  return `${minutes} min left`;
}

/** DEADLINE WITHIN WARNING WINDOW */
export function isExpiringSoon(iso: string, from: Date = new Date()): boolean {
  const ms = new Date(iso).getTime() - from.getTime();
  return ms > 0 && ms <= 2 * 60 * 60 * 1000;
}

export function hasPassed(iso: string, from: Date = new Date()): boolean {
  return new Date(iso).getTime() <= from.getTime();
}

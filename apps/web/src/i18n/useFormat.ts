import { useMemo } from 'react';
import type { Language } from '@fedsa/contract';
import { useLanguage, useT } from './useT';

/** en-ZA after each, for a browser without that language's dates */
const LOCALES: Record<Language, string[]> = {
  en: ['en-ZA'],
  af: ['af-ZA', 'en-ZA'],
  xh: ['xh-ZA', 'en-ZA'],
};

/** fills `{n}` slots in a translated string */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in values ? String(values[name]) : slot,
  );
}

const DAY_MS = 86_400_000;

/** the date and countdown wording of `lib/format`, in the reader's language */
export function useFormat() {
  const t = useT();
  const language = useLanguage();

  return useMemo(() => {
    const locales = LOCALES[language];

    const time = (iso: string) =>
      new Date(iso).toLocaleTimeString(locales, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

    const date = (iso: string) =>
      new Date(iso).toLocaleDateString(locales, { day: 'numeric', month: 'short' });

    function when(iso: string): string {
      const d = new Date(iso);
      const now = new Date();
      const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const days = Math.round((midnight(d) - midnight(now)) / DAY_MS);
      if (days === 0) return `${t('time.today')} ${time(iso)}`;
      if (days === 1) return `${t('time.tomorrow')} ${time(iso)}`;
      if (days === -1) return `${t('time.yesterday')} ${time(iso)}`;
      return `${date(iso)} ${time(iso)}`;
    }

    /** null once the deadline has passed */
    function timeLeft(iso: string, from: Date = new Date()): string | null {
      const ms = new Date(iso).getTime() - from.getTime();
      if (ms <= 0) return null;
      const minutes = Math.floor(ms / 60_000);
      const days = Math.floor(minutes / 1440);
      if (days === 1) return t('time.oneDayLeft');
      if (days > 1) return fill(t('time.daysLeft'), { n: days });
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      if (h >= 1) return fill(t('time.hoursLeft'), { h, m });
      return fill(t('time.minutesLeft'), { m });
    }

    return { time, date, when, timeLeft };
  }, [t, language]);
}

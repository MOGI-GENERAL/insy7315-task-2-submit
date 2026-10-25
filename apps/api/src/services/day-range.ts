/** South Africa has no daylight saving, so every day starts at the same offset */
export const SA_OFFSET = '+02:00';

const DAY_MS = 24 * 60 * 60 * 1000;

const saMonth = new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg',
  year: 'numeric',
  month: '2-digit',
});

/** the calendar month before the South African month containing `at`, as `YYYY-MM` */
export function previousMonth(at: Date) {
  const parts = saMonth.formatToParts(at);
  const year = Number(parts.find((p) => p.type === 'year')!.value);
  const month = Number(parts.find((p) => p.type === 'month')!.value);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** first and last day of a `YYYY-MM` month, ready for `dayRange` */
export function monthDays(month: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new Error(`Month must look like 2026-10, not "${month}"`);
  const year = Number(match[1]);
  const lastDay = new Date(Date.UTC(year, Number(match[2]), 0)).getUTCDate();
  return { periodStart: `${month}-01`, periodEnd: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** `from` and `to` are calendar days in South African time, and both ends are included */
export function dayRange(from?: string, to?: string) {
  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) range.$gte = new Date(`${from}T00:00:00${SA_OFFSET}`);
  if (to) range.$lt = new Date(Date.parse(`${to}T00:00:00${SA_OFFSET}`) + DAY_MS);
  return range;
}

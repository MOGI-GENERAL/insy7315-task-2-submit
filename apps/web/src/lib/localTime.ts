/** `datetime-local` value for a date, in the phone's time zone */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** an unparseable value goes through as it is, for the schema to report against the field */
export function localInputToIso(local: string): string {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? local : date.toISOString();
}

/** South Africa has no daylight saving, so every day starts at the same offset */
const SA_OFFSET = '+02:00';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `from` and `to` are calendar days in South African time, and both ends are included */
export function dayRange(from?: string, to?: string) {
  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) range.$gte = new Date(`${from}T00:00:00${SA_OFFSET}`);
  if (to) range.$lt = new Date(Date.parse(`${to}T00:00:00${SA_OFFSET}`) + DAY_MS);
  return range;
}

const SA_OFFSET_MS = 2 * 60 * 60 * 1000;

/** hours and days are South African, which has no daylight saving to handle */
export function dueJobs(now: Date) {
  const sa = new Date(now.getTime() + SA_OFFSET_MS);
  return {
    expiry: true,
    retention: sa.getUTCHours() === 2,
    certificates: sa.getUTCDate() === 1,
  };
}

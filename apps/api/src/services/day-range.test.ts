import { describe, expect, test } from 'vitest';
import { monthDays, previousMonth } from './day-range.js';

describe('previousMonth', () => {
  test('goes back across a year boundary', () => {
    expect(previousMonth(new Date('2027-01-01T00:30:00+02:00'))).toBe('2026-12');
  });

  test('stays in the same year mid-year', () => {
    expect(previousMonth(new Date('2026-12-31T23:30:00+02:00'))).toBe('2026-11');
  });

  test('reads the South African month, not the UTC one', () => {
    expect(previousMonth(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12');
  });
});

describe('monthDays', () => {
  test('gives the first and last day of a 31-day month', () => {
    expect(monthDays('2026-10')).toEqual({ periodStart: '2026-10-01', periodEnd: '2026-10-31' });
  });

  test('gives 29 days for February in a leap year', () => {
    expect(monthDays('2028-02')).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
  });

  test('gives 28 days for February otherwise', () => {
    expect(monthDays('2027-02').periodEnd).toBe('2027-02-28');
  });

  test('refuses a malformed month', () => {
    expect(() => monthDays('2026-13')).toThrow('Month must look like 2026-10');
    expect(() => monthDays('2026-1')).toThrow();
    expect(() => monthDays('October')).toThrow();
  });
});

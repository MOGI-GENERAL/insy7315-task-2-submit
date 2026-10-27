import { describe, expect, test } from 'vitest';
import { dueJobs } from './schedule.js';

describe('dueJobs', () => {
  test('expiry runs every time', () => {
    expect(dueJobs(new Date('2026-10-27T13:05:00+02:00')).expiry).toBe(true);
  });

  test.each([
    ['01:59', false],
    ['02:00', true],
    ['02:59', true],
    ['03:00', false],
  ])('retention at %s South African time is %s', (time, due) => {
    expect(dueJobs(new Date(`2026-10-27T${time}:00+02:00`)).retention).toBe(due);
  });

  test('certificates run on the 1st in South African time, not in UTC', () => {
    expect(dueJobs(new Date('2026-10-31T22:00:00Z')).certificates).toBe(true);
    expect(dueJobs(new Date('2026-11-01T22:00:00Z')).certificates).toBe(false);
    expect(dueJobs(new Date('2026-10-31T21:55:00Z')).certificates).toBe(false);
  });
});

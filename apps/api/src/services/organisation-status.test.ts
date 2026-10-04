import { OrganisationStatus, VerificationDecision } from '@fedsa/contract';
import { describe, expect, test } from 'vitest';
import { InvalidStateError } from '../errors.js';
import {
  CLAIMING_STATUSES,
  canClaim,
  hasTransition,
  nextStatus,
  type StatusEvent,
} from './organisation-status.js';

const EVENTS: StatusEvent[] = [...VerificationDecision.options, 'first_fulfilment'];

/** written out by hand, so a change to the table has to be made here too */
const EXPECTED: Record<OrganisationStatus, Partial<Record<StatusEvent, OrganisationStatus>>> = {
  pending: { verify: 'verified', reject: 'rejected' },
  verified: { suspend: 'suspended', first_fulfilment: 'active' },
  rejected: { verify: 'verified' },
  active: { suspend: 'suspended' },
  // reinstate depends on the claim history, so it has its own tests below
  suspended: {},
};

const cells = OrganisationStatus.options.flatMap((from) =>
  EVENTS.map((event) => ({ from, event, to: EXPECTED[from][event] })),
);
const allowed = cells.filter((c) => c.to !== undefined);
const refused = cells.filter(
  (c) => c.to === undefined && !(c.from === 'suspended' && c.event === 'reinstate'),
);

describe('allowed transitions', () => {
  test.each(allowed)('$from + $event gives $to', ({ from, event, to }) => {
    expect(nextStatus(from, event)).toBe(to);
    expect(nextStatus(from, event, true)).toBe(to);
    expect(hasTransition(from, event)).toBe(true);
  });

  test('reinstating an organisation with a fulfilled claim makes it active', () => {
    expect(nextStatus('suspended', 'reinstate', true)).toBe('active');
  });

  test('reinstating an organisation without a fulfilled claim makes it verified', () => {
    expect(nextStatus('suspended', 'reinstate', false)).toBe('verified');
    expect(hasTransition('suspended', 'reinstate')).toBe(true);
  });
});

describe('refused transitions', () => {
  test.each(refused)('$from + $event is an invalid state', ({ from, event }) => {
    expect(() => nextStatus(from, event, false)).toThrow(InvalidStateError);
    expect(() => nextStatus(from, event, true)).toThrow(InvalidStateError);
    expect(hasTransition(from, event)).toBe(false);
  });

  test('every cell is either allowed or refused', () => {
    expect(allowed.length + refused.length + 1).toBe(
      OrganisationStatus.options.length * EVENTS.length,
    );
  });
});

describe('canClaim', () => {
  const statuses = OrganisationStatus.options;

  test.each(statuses)('a recipient that is %s', (status) => {
    expect(canClaim({ type: 'recipient', status })).toBe(
      status === 'verified' || status === 'active',
    );
  });

  test.each(statuses)('a donor that is %s never claims', (status) => {
    expect(canClaim({ type: 'donor', status })).toBe(false);
  });

  test('the claiming statuses are verified and active', () => {
    expect([...CLAIMING_STATUSES].sort()).toEqual(['active', 'verified']);
  });
});

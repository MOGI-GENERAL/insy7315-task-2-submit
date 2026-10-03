import type { OrganisationStatus, OrganisationType, VerificationDecision } from '@fedsa/contract';
import { InvalidStateError } from '../errors.js';

/** a coordinator's decision, or the change the API makes on a first fulfilled claim */
export type StatusEvent = VerificationDecision | 'first_fulfilment';

interface Transition {
  from: OrganisationStatus;
  event: StatusEvent;
  to: OrganisationStatus;
  /** set only where the target depends on whether the organisation has a fulfilled claim */
  hasFulfilledClaim?: boolean;
}

/** every status change an organisation can make. donors start `active` and never go through it */
export const TRANSITIONS: readonly Transition[] = [
  { from: 'pending', event: 'verify', to: 'verified' },
  { from: 'rejected', event: 'verify', to: 'verified' },
  { from: 'pending', event: 'reject', to: 'rejected' },
  { from: 'verified', event: 'suspend', to: 'suspended' },
  { from: 'active', event: 'suspend', to: 'suspended' },
  { from: 'suspended', event: 'reinstate', to: 'active', hasFulfilledClaim: true },
  { from: 'suspended', event: 'reinstate', to: 'verified', hasFulfilledClaim: false },
  { from: 'verified', event: 'first_fulfilment', to: 'active' },
];

/** exported for queries that filter on the same rule as `canClaim` */
export const CLAIMING_STATUSES: readonly OrganisationStatus[] = ['verified', 'active'];

function findTransition(from: OrganisationStatus, event: StatusEvent, hasFulfilledClaim: boolean) {
  return TRANSITIONS.find(
    (t) =>
      t.from === from &&
      t.event === event &&
      (t.hasFulfilledClaim === undefined || t.hasFulfilledClaim === hasFulfilledClaim),
  );
}

export function hasTransition(from: OrganisationStatus, event: StatusEvent) {
  return TRANSITIONS.some((t) => t.from === from && t.event === event);
}

export function nextStatus(
  from: OrganisationStatus,
  event: StatusEvent,
  hasFulfilledClaim = false,
): OrganisationStatus {
  const transition = findTransition(from, event, hasFulfilledClaim);
  if (!transition) {
    throw new InvalidStateError(`An organisation that is ${from} cannot take the ${event} step`);
  }
  return transition.to;
}

export function canClaim(organisation: { type: OrganisationType; status: OrganisationStatus }) {
  return organisation.type === 'recipient' && CLAIMING_STATUSES.includes(organisation.status);
}

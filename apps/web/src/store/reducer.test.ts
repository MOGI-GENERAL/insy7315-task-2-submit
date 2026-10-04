import { describe, expect, test } from 'vitest';
import { reducer } from './reducer';
import { createInitialState } from './seed';
import { disputeViews, isOpenDispute } from './selectors';
import type { AppState } from './types';

const DONOR = 'usr-riaan';
const RECIPIENT = 'usr-peter';
const COORDINATOR = 'usr-nadia';

/** OF-1001 is open, ambient and inside St Michael's capacity */
function claimed(): { state: AppState; claimId: string; offerId: string } {
  let state = createInitialState();
  const offerId = 'off-1001';
  state = reducer(state, {
    type: 'CLAIM_OFFER',
    offerId,
    userId: RECIPIENT,
    transportNeeded: false,
  });
  const claim = state.claims.find((c) => c.offerId === offerId && c.status === 'active')!;
  return { state, claimId: claim.id, offerId };
}

describe('claiming', () => {
  test('a second claim on the same offer is refused', () => {
    const { state, offerId } = claimed();
    const after = reducer(state, {
      type: 'CLAIM_OFFER',
      offerId,
      userId: 'usr-thandi',
      transportNeeded: false,
    });

    expect(after.claims.filter((c) => c.offerId === offerId)).toHaveLength(1);
    expect(after.lastEvent?.kind).toBe('claim-rejected');
  });

  test('a release keeps the claim and reopens the offer', () => {
    const { state, claimId, offerId } = claimed();
    const after = reducer(state, { type: 'RELEASE_CLAIM', claimId, reason: 'van broke down' });

    expect(after.claims.find((c) => c.id === claimId)?.status).toBe('released');
    expect(after.offers.find((o) => o.id === offerId)?.status).toBe('open');
  });
});

describe('handover', () => {
  test('starts at the donor confirmation and splits off the shortfall as a new offer', () => {
    const { state, claimId, offerId } = claimed();
    expect(state.handovers.some((h) => h.claimId === claimId)).toBe(false);

    const offered = state.offers.find((o) => o.id === offerId)!.offeredQuantityKg;
    const after = reducer(state, {
      type: 'CONFIRM_HANDOVER_DONOR',
      claimId,
      userId: DONOR,
      quantityKg: offered - 4,
      photo: null,
    });

    const handover = after.handovers.find((h) => h.claimId === claimId)!;
    expect(handover.collectedQuantityKg).toBe(offered - 4);
    expect(handover.recipientConfirmedAt).toBeNull();

    const remainder = after.offers.find((o) => o.parentOfferId === offerId)!;
    expect(remainder).toMatchObject({ offeredQuantityKg: 4, status: 'open' });
  });

  test('the recipient confirmation fulfils the claim and collects the offer', () => {
    const { state, claimId, offerId } = claimed();
    const offered = state.offers.find((o) => o.id === offerId)!.offeredQuantityKg;
    let after = reducer(state, {
      type: 'CONFIRM_HANDOVER_DONOR',
      claimId,
      userId: DONOR,
      quantityKg: offered,
      photo: null,
    });
    after = reducer(after, {
      type: 'CONFIRM_HANDOVER_RECIPIENT',
      claimId,
      userId: RECIPIENT,
      condition: 'good',
      note: '',
    });

    expect(after.claims.find((c) => c.id === claimId)?.status).toBe('fulfilled');
    expect(after.offers.find((o) => o.id === offerId)?.status).toBe('collected');
    expect(after.offers.some((o) => o.parentOfferId === offerId)).toBe(false);
  });

  test('a problem opens a dispute that a coordinator closes once with a note', () => {
    const { state, claimId, offerId } = claimed();
    const offered = state.offers.find((o) => o.id === offerId)!.offeredQuantityKg;
    let after = reducer(state, {
      type: 'CONFIRM_HANDOVER_DONOR',
      claimId,
      userId: DONOR,
      quantityKg: offered,
      photo: null,
    });
    after = reducer(after, {
      type: 'CONFIRM_HANDOVER_RECIPIENT',
      claimId,
      userId: RECIPIENT,
      condition: 'problem',
      note: 'Half the rolls were mouldy',
    });

    const handover = after.handovers.find((h) => h.claimId === claimId)!;
    expect(isOpenDispute(handover)).toBe(true);
    expect(disputeViews(after).some((v) => v.handover.id === handover.id)).toBe(true);

    after = reducer(after, {
      type: 'RESOLVE_DISPUTE',
      handoverId: handover.id,
      note: 'Donor agreed to check stock before posting',
      userId: COORDINATOR,
    });
    const resolved = after.handovers.find((h) => h.id === handover.id)!;
    expect(resolved.resolutionNote).toBe('Donor agreed to check stock before posting');

    const again = reducer(after, {
      type: 'RESOLVE_DISPUTE',
      handoverId: handover.id,
      note: 'changed my mind',
      userId: COORDINATOR,
    });
    expect(again.handovers.find((h) => h.id === handover.id)?.resolutionNote).toBe(
      'Donor agreed to check stock before posting',
    );
  });
});

describe('verification', () => {
  test('follows the state machine and ignores a decision it does not allow', () => {
    let state = createInitialState();
    const verify = (decision: 'verify' | 'reject' | 'suspend' | 'reinstate') =>
      (state = reducer(state, {
        type: 'SET_VERIFICATION',
        organisationId: 'org-hope',
        decision,
        userId: COORDINATOR,
      }));
    const status = () => state.organisations.find((o) => o.id === 'org-hope')?.status;

    verify('suspend');
    expect(status()).toBe('pending');
    verify('reject');
    expect(status()).toBe('rejected');
    verify('verify');
    expect(status()).toBe('verified');
    verify('suspend');
    expect(status()).toBe('suspended');
    verify('reinstate');
    expect(status()).toBe('verified');
  });
});

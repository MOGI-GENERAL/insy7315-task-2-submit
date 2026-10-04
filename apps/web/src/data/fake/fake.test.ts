import { describe, expect, test } from 'vitest';
import { createStore } from '../../store/store';
import { isApiError } from '../ApiError';
import { createFakeDataLayer } from '.';

function setup(failOn: string[] = []) {
  const store = createStore();
  const data = createFakeDataLayer(store, { delayMs: 0, failOn: new Set(failOn) });
  return { store, data };
}

const deadline = () => new Date(Date.now() + 2 * 3_600_000).toISOString();

describe('fake data layer', () => {
  test('signs in by email and refuses an unknown one with the same error as a wrong password', async () => {
    const { data } = setup();

    await expect(
      data.auth.login({ email: 'nobody@example.org', password: 'x' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    const session = await data.auth.login({ email: 'peter@example.org', password: 'anything' });
    expect(session.user.role).toBe('recipient');
    expect(session.organisation?.type).toBe('recipient');
  });

  test('the second organisation to claim gets OFFER_UNAVAILABLE and a repeat by the first is harmless', async () => {
    const { data } = setup();

    await data.auth.login({ email: 'peter@example.org', password: 'x' });
    const first = await data.offers.claim('off-1001', { transportNeeded: false });
    const again = await data.offers.claim('off-1001', { transportNeeded: false });
    expect(again.claim.id).toBe(first.claim.id);

    await data.auth.login({ email: 'thandi@example.org', password: 'x' });
    const error = await data.offers.claim('off-1001', { transportNeeded: false }).catch((e) => e);
    expect(isApiError(error, 'OFFER_UNAVAILABLE')).toBe(true);
  });

  test('a repeated idempotency key returns the first offer', async () => {
    const { data, store } = setup();
    await data.auth.login({ email: 'riaan@example.org', password: 'x' });
    const fields = {
      title: '20 loaves',
      category: 'bakery' as const,
      offeredQuantityKg: 10,
      coldChain: 'ambient' as const,
      collectionDeadline: deadline(),
    };

    const first = await data.offers.post(fields, [], 'key-1');
    const count = store.getState().offers.length;
    const second = await data.offers.post(fields, [], 'key-1');

    expect(second.offer.id).toBe(first.offer.id);
    expect(store.getState().offers).toHaveLength(count);
    expect(first.notifiedCount).toBeGreaterThan(0);
  });

  test('the recipient cannot confirm before the donor has', async () => {
    const { data } = setup();
    await data.auth.login({ email: 'peter@example.org', password: 'x' });
    await data.offers.claim('off-1001', { transportNeeded: false });

    await expect(
      data.handovers.recipientConfirm('off-1001', { conditionOnReceipt: 'good' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
  });

  test('an unverified recipient sees an empty feed and cannot claim', async () => {
    const { data } = setup();
    await data.auth.login({ email: 'beauty@example.org', password: 'x' });

    expect((await data.offers.list({ view: 'feed' })).items).toEqual([]);
    await expect(data.offers.claim('off-1001', { transportNeeded: true })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('a method named in failOn rejects with INTERNAL', async () => {
    const { data } = setup(['claim']);
    await data.auth.login({ email: 'peter@example.org', password: 'x' });

    await expect(data.offers.claim('off-1001', { transportNeeded: false })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });
});

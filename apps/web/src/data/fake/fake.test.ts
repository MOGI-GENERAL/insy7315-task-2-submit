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
    expect((await data.offers.list({ view: 'scheduled' })).items).toEqual([]);
    await expect(data.offers.claim('off-1001', { transportNeeded: true })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('a release is repeatable, and a claim that is no longer active cannot be released', async () => {
    const { data } = setup();
    await data.auth.login({ email: 'peter@example.org', password: 'x' });
    const { claim } = await data.offers.claim('off-1001', { transportNeeded: false });

    const first = await data.claims.release(claim.id, { reason: 'No transport today' });
    const again = await data.claims.release(claim.id, {});
    expect(first.offer.status).toBe('open');
    expect(again.claim).toEqual(first.claim);

    const { items } = await data.claims.list({ status: 'fulfilled' });
    await expect(data.claims.release(items[0].id, {})).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });

  test('push has a key the browser accepts, and subscribing needs someone signed in', async () => {
    const { data } = setup();
    const body = { endpoint: 'https://push.example.org/1', keys: { p256dh: 'p', auth: 'a' } };

    const key = await data.notifications.pushKey();
    const bytes = atob(key!.replace(/-/g, '+').replace(/_/g, '/'));
    expect(bytes).toHaveLength(65);
    expect(bytes.charCodeAt(0)).toBe(4);

    await expect(data.notifications.subscribePush(body)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await data.auth.login({ email: 'peter@example.org', password: 'x' });
    await expect(data.notifications.subscribePush(body)).resolves.toBeUndefined();
    await expect(
      data.notifications.unsubscribePush({ endpoint: body.endpoint }),
    ).resolves.toBeUndefined();
  });

  test('the inbox lists in-app rows and marks only the signed-in user’s rows as read', async () => {
    const { data, store } = setup();
    await data.auth.login({ email: 'peter@example.org', password: 'x' });
    const peter = store.getState().currentUserId;
    const other = store.getState().notifications.find((n) => n.userId !== peter)!;

    const { items } = await data.notifications.list();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((n) => n.channel === 'in_app')).toBe(true);
    await expect(data.notifications.markRead(other.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  describe('dispatch', () => {
    async function claimWithoutDriver() {
      const { data } = setup();
      await data.auth.login({ email: 'nadia@example.org', password: 'x' });
      const { items } = await data.claims.list({ status: 'active' });
      for (const claim of items.filter((c) => c.transportNeeded)) {
        if (!(await data.offers.get(claim.offerId)).collection) return { data, claim };
      }
      throw new Error('the seed has no claim waiting for a driver');
    }

    const scheduledFor = deadline();
    const request = (driverName: string) => ({
      driverName,
      driverPhone: '+27821112222',
      scheduledFor,
    });

    test('a repeat dispatch returns the first collection unchanged', async () => {
      const { data, claim } = await claimWithoutDriver();

      const first = await data.claims.dispatch(claim.id, request('Themba Mokoena'));
      const repeat = await data.claims.dispatch(claim.id, request('Someone Else'));

      expect(first.created).toBe(true);
      expect(repeat).toEqual({ collection: first.collection, created: false });
      expect(first.collection).toMatchObject({
        status: 'dispatched',
        driverName: 'Themba Mokoena',
        scheduledFor,
      });
    });

    test('a repeat dispatch keeps the first driver and the first link', async () => {
      const { data, claim } = await claimWithoutDriver();
      const first = 'a'.repeat(43);
      const second = 'b'.repeat(43);

      await data.claims.dispatch(claim.id, { ...request('Themba Mokoena'), driverToken: first });
      const repeat = await data.claims.dispatch(claim.id, {
        ...request('Someone Else'),
        driverPhone: '+27829998888',
        driverToken: second,
      });

      expect(repeat.created).toBe(false);
      expect(repeat.collection).toMatchObject({
        driverName: 'Themba Mokoena',
        driverPhone: '+27821112222',
      });
      await expect(data.driver.collection(first)).resolves.toMatchObject({
        driverName: 'Themba Mokoena',
      });
      await expect(data.driver.collection(second)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    test('a collection can be closed once and then stays closed', async () => {
      const { data, claim } = await claimWithoutDriver();
      const { collection } = await data.claims.dispatch(claim.id, request('Themba Mokoena'));

      const done = await data.claims.updateCollection(collection.id, { status: 'completed' });
      expect(done.collection.status).toBe('completed');
      await expect(
        data.claims.updateCollection(collection.id, { status: 'cancelled' }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
    });
  });

  describe('driver link', () => {
    const token = (c: string) => c.repeat(43);

    async function dispatched(driverToken: string) {
      const { data } = setup();
      await data.auth.login({ email: 'nadia@example.org', password: 'x' });
      const { items } = await data.claims.list({ status: 'active' });
      let claim;
      for (const candidate of items.filter((c) => c.transportNeeded)) {
        if (!(await data.offers.get(candidate.offerId)).collection) claim = candidate;
      }
      const { collection } = await data.claims.dispatch(claim!.id, {
        driverName: 'Themba Mokoena',
        driverPhone: '+27821112222',
        scheduledFor: deadline(),
        driverToken,
      });
      return { data, collection };
    }

    test('opens the collection it was dispatched with, and nothing else', async () => {
      const { data } = await dispatched(token('a'));

      const page = await data.driver.collection(token('a'));

      expect(page.driverName).toBe('Themba Mokoena');
      expect(page.pickup.organisationName).not.toBe('');
      await expect(data.driver.collection(token('b'))).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    test('a reused token is refused', async () => {
      const { data, collection } = await dispatched(token('a'));

      await expect(
        data.claims.rotateDriverLink(collection.id, { driverToken: token('a') }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', fields: { driverToken: expect.any(String) } });
    });

    test('rotating replaces the old link', async () => {
      const { data, collection } = await dispatched(token('a'));

      await data.claims.rotateDriverLink(collection.id, { driverToken: token('b') });

      await expect(data.driver.collection(token('a'))).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(data.driver.collection(token('b'))).resolves.toMatchObject({
        driverName: 'Themba Mokoena',
      });
    });

    test('a closed collection has a dead link and cannot be rotated', async () => {
      const { data, collection } = await dispatched(token('a'));
      await data.claims.updateCollection(collection.id, { status: 'completed' });

      await expect(data.driver.collection(token('a'))).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(
        data.claims.rotateDriverLink(collection.id, { driverToken: token('b') }),
      ).rejects.toMatchObject({ code: 'INVALID_STATE', status: 409 });
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

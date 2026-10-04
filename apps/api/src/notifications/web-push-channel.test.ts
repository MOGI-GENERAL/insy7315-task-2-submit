import { describe, expect, test } from 'vitest';
import { createLogger } from '../logger.js';
import type { OutgoingMessage, StoredPushSubscription } from './notification-channel.js';
import { WebPushChannel, type PushSender } from './web-push-channel.js';

const logger = createLogger({ write: () => {} });

const MESSAGE: OutgoingMessage = {
  title: 'New offer K4F2',
  body: '31 kg in Woodstock. Collect by Sat, 03 Oct, 17:00.',
  phoneText: 'FEDSA: New offer K4F2. 31 kg in Woodstock. Reply YES K4F2 to claim.',
  href: '/recipient/offers/0123456789abcdef01234567',
};

function subscription(name: string): StoredPushSubscription {
  return {
    endpoint: `https://push.example.test/${name}`,
    keys: { p256dh: `fake-p256dh-${name}`, auth: `fake-auth-${name}` },
  };
}

/** stands in for `web-push`. an endpoint listed in `statuses` fails with that status code */
function fakeSender(statuses: Record<string, number> = {}) {
  const calls: { endpoint: string; payload: unknown }[] = [];
  const send: PushSender = async (sub, payload) => {
    calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    const status = statuses[sub.endpoint];
    if (status) throw Object.assign(new Error('push service refused'), { statusCode: status });
    return { statusCode: 201 };
  };
  return { send, calls };
}

describe('web push', () => {
  test('reaches only a person with a subscription', () => {
    const channel = new WebPushChannel(fakeSender().send, logger);
    expect(channel.supports({ phone: '+27820000000', pushSubscriptions: [] })).toBe(false);
    expect(channel.supports({ phone: null, pushSubscriptions: [subscription('a')] })).toBe(true);
  });

  test('sends the title, body and link to every subscription, and no photo', async () => {
    const sender = fakeSender();
    const channel = new WebPushChannel(sender.send, logger);
    const recipient = { phone: null, pushSubscriptions: [subscription('a'), subscription('b')] };

    const deliveries = await channel.send(recipient, MESSAGE);

    expect(deliveries).toEqual([
      { to: subscription('a').endpoint, status: 'sent', providerMessageId: null, gone: false },
      { to: subscription('b').endpoint, status: 'sent', providerMessageId: null, gone: false },
    ]);
    expect(sender.calls.map((c) => c.payload)).toEqual([
      { title: MESSAGE.title, body: MESSAGE.body, href: MESSAGE.href },
      { title: MESSAGE.title, body: MESSAGE.body, href: MESSAGE.href },
    ]);
  });

  test.each([404, 410])('a subscription answered with %i is reported gone', async (status) => {
    const sender = fakeSender({ [subscription('old').endpoint]: status });
    const channel = new WebPushChannel(sender.send, logger);
    const recipient = {
      phone: null,
      pushSubscriptions: [subscription('old'), subscription('new')],
    };

    const [old, current] = await channel.send(recipient, MESSAGE);

    expect(old).toMatchObject({ status: 'failed', gone: true });
    expect(current).toMatchObject({ status: 'sent', gone: false });
  });

  test('any other refusal fails without calling the subscription gone', async () => {
    const sender = fakeSender({ [subscription('a').endpoint]: 500 });
    const channel = new WebPushChannel(sender.send, logger);

    const [delivery] = await channel.send(
      { phone: null, pushSubscriptions: [subscription('a')] },
      MESSAGE,
    );

    expect(delivery).toMatchObject({ status: 'failed', gone: false });
  });

  test('a network error fails the delivery instead of throwing', async () => {
    const channel = new WebPushChannel(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }, logger);

    const [delivery] = await channel.send(
      { phone: null, pushSubscriptions: [subscription('a')] },
      MESSAGE,
    );

    expect(delivery).toMatchObject({ status: 'failed', gone: false });
  });
});

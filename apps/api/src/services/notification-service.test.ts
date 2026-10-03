import { NotificationKind } from '@fedsa/contract';
import { Types } from 'mongoose';
import { describe, expect, test } from 'vitest';
import { NotificationRepository, UserRepository } from '../db/index.js';
import { createLogger } from '../logger.js';
import { MemoryChannel } from '../notifications/memory-channel.js';
import type { NotificationChannel, Recipient } from '../notifications/notification-channel.js';
import { NotificationService } from './notification-service.js';

const push = new MemoryChannel('push');
const whatsapp = new MemoryChannel('whatsapp');
const sms = new MemoryChannel('sms');

/** selection reads no data, so the repositories are never called */
function service(channels: NotificationChannel[], mirror = true) {
  return new NotificationService(new NotificationRepository(), new UserRepository(), {
    channels,
    mirror,
    vapidPublicKey: null,
    logger: createLogger({ write: () => {} }),
  });
}

const subscribed: Recipient = {
  phone: '+27820000001',
  pushSubscriptions: [
    { endpoint: 'https://push.example.test/a', keys: { p256dh: 'p', auth: 'a' } },
  ],
};
const notSubscribed: Recipient = { phone: '+27820000001', pushSubscriptions: [] };

function names(channels: NotificationChannel[]) {
  return channels.map((c) => c.name);
}

describe('selecting channels for an offer', () => {
  test('push and WhatsApp for a subscribed user during the transition', () => {
    expect(names(service([push, whatsapp, sms]).selectChannel(subscribed, 'offer_posted'))).toEqual(
      ['push', 'whatsapp'],
    );
  });

  test('WhatsApp alone for a user without a push subscription', () => {
    expect(
      names(service([push, whatsapp, sms]).selectChannel(notSubscribed, 'offer_posted')),
    ).toEqual(['whatsapp']);
  });

  test('SMS when WhatsApp is off', () => {
    expect(names(service([push, sms]).selectChannel(subscribed, 'offer_posted'))).toEqual([
      'push',
      'sms',
    ]);
  });

  test('only push once the transition is over', () => {
    expect(
      names(service([push, whatsapp, sms], false).selectChannel(subscribed, 'offer_posted')),
    ).toEqual(['push']);
  });

  test('nothing beyond the inbox when no channel is on', () => {
    expect(service([]).selectChannel(subscribed, 'offer_posted')).toEqual([]);
  });

  test('push is skipped while it is off, even for a subscribed user', () => {
    expect(names(service([sms]).selectChannel(subscribed, 'offer_posted'))).toEqual(['sms']);
  });
});

describe('mirroring by kind', () => {
  const mirrored = ['offer_posted', 'offer_claimed', 'claim_released'];

  test.each(NotificationKind.options)('%s', (kind) => {
    const chosen = names(service([push, sms]).selectChannel(subscribed, kind));
    expect(chosen).toEqual(mirrored.includes(kind) ? ['push', 'sms'] : ['push']);
  });
});

/** holds each send for one turn of the event loop and records how many were in flight at once */
class ConcurrencyProbe extends MemoryChannel {
  active = 0;
  peak = 0;

  async send(recipient: Recipient, message: Parameters<MemoryChannel['send']>[1]) {
    this.active += 1;
    this.peak = Math.max(this.peak, this.active);
    await new Promise((resolve) => setImmediate(resolve));
    this.active -= 1;
    return super.send(recipient, message);
  }
}

describe('fan-out', () => {
  test('45 users are sent to 20 at a time, and every one gets their rows', async () => {
    const users = Array.from({ length: 45 }, (_, i) => ({
      _id: new Types.ObjectId(),
      organisationId: new Types.ObjectId(),
      role: 'recipient',
      languagePreference: 'en',
      phone: `+278200${String(i).padStart(5, '0')}`,
      pushSubscriptions: [],
    }));
    const rows: unknown[] = [];
    const fakeUsers = { findActiveInOrganisations: async () => users };
    const fakeNotifications = { create: async (row: unknown) => void rows.push(row) };
    const probe = new ConcurrencyProbe('sms');
    const fanOut = new NotificationService(
      fakeNotifications as unknown as NotificationRepository,
      fakeUsers as unknown as UserRepository,
      {
        channels: [probe],
        mirror: true,
        vapidPublicKey: null,
        logger: createLogger({ write: () => {} }),
      },
    );

    const result = await fanOut.notifyOrganisations(['any'], 'offer_posted', {
      reference: 'K4F2',
      quantityKg: 31,
      suburb: 'Woodstock',
      deadline: new Date().toISOString(),
    });

    expect(probe.peak).toBe(20);
    expect(probe.sent).toHaveLength(45);
    expect(rows).toHaveLength(90);
    expect(result).toEqual({ users: 45, rows: 90, failed: 0 });
  });
});

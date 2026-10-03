import { beforeEach, expect, test } from 'vitest';
import { createLogger } from '../logger.js';
import { channelSettings } from './channel-settings.js';
import { ConsoleChannel } from './console-channel.js';
import { TwilioSmsChannel, TwilioWhatsAppChannel } from './twilio-channels.js';
import { WebPushChannel } from './web-push-channel.js';

const logLines: string[] = [];
const logger = createLogger({ write: (line: string) => void logLines.push(line) });
const logs = () => logLines.join('');

/** every value is fake. nothing here is ever sent anywhere */
const COMPLETE = {
  NOTIFY_CHANNELS: 'push,whatsapp,sms',
  VAPID_PUBLIC_KEY: 'fake-vapid-public-key',
  VAPID_PRIVATE_KEY: 'fake-vapid-private-key',
  VAPID_SUBJECT: 'mailto:notifications@example.org',
  TWILIO_ACCOUNT_SID: `AC${'0'.repeat(32)}`,
  TWILIO_AUTH_TOKEN: 'fake-auth-token',
  TWILIO_SMS_FROM: '+27820000000',
  TWILIO_WHATSAPP_FROM: '+27820000000',
};

beforeEach(() => {
  logLines.length = 0;
});

test('with no settings at all, no channel is on and push has no key', () => {
  expect(channelSettings({}, logger)).toEqual({
    channels: [],
    mirror: true,
    vapidPublicKey: null,
  });
});

test('channels that are listed but missing settings stay off and say why', () => {
  const settings = channelSettings({ NOTIFY_CHANNELS: 'push,whatsapp,sms' }, logger);

  expect(settings.channels).toEqual([]);
  expect(settings.vapidPublicKey).toBeNull();
  expect(logs()).toContain('push is off');
  expect(logs()).toContain('WhatsApp is off');
  expect(logs()).toContain('SMS is off');
});

test('complete settings turn on push, WhatsApp and SMS in that order', () => {
  const settings = channelSettings(COMPLETE, logger);

  expect(settings.channels.map((c) => c.constructor)).toEqual([
    WebPushChannel,
    TwilioWhatsAppChannel,
    TwilioSmsChannel,
  ]);
  expect(settings.vapidPublicKey).toBe(COMPLETE.VAPID_PUBLIC_KEY);
});

test('credentials alone do not turn a channel on', () => {
  const settings = channelSettings({ ...COMPLETE, NOTIFY_CHANNELS: 'sms' }, logger);

  expect(settings.channels.map((c) => c.name)).toEqual(['sms']);
  expect(settings.vapidPublicKey).toBeNull();
});

test('a malformed Twilio account turns the Twilio channels off without throwing', () => {
  const settings = channelSettings({ ...COMPLETE, TWILIO_ACCOUNT_SID: 'not-an-account' }, logger);

  expect(settings.channels.map((c) => c.name)).toEqual(['push']);
  expect(logs()).not.toContain(COMPLETE.TWILIO_AUTH_TOKEN);
});

test('the console stand-in logs SMS text and comes after a real SMS channel', () => {
  expect(channelSettings({ NOTIFY_CHANNELS: 'console' }, logger).channels).toEqual([
    expect.any(ConsoleChannel),
  ]);
  const both = channelSettings({ ...COMPLETE, NOTIFY_CHANNELS: 'console, SMS' }, logger);
  expect(both.channels.map((c) => c.constructor)).toEqual([TwilioSmsChannel, ConsoleChannel]);
});

test('an unknown channel name is reported and ignored', () => {
  const settings = channelSettings({ NOTIFY_CHANNELS: 'pigeon' }, logger);
  expect(settings.channels).toEqual([]);
  expect(logs()).toContain('pigeon');
});

test.each([
  [undefined, true],
  ['', true],
  ['true', true],
  ['false', false],
  [' FALSE ', false],
])('NOTIFY_MIRROR=%s leaves mirroring %s', (value, expected) => {
  expect(channelSettings({ NOTIFY_MIRROR: value }, logger).mirror).toBe(expected);
});

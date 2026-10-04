import { describe, expect, test } from 'vitest';
import { createLogger } from '../logger.js';
import type { OutgoingMessage } from './notification-channel.js';
import {
  TwilioSmsChannel,
  TwilioWhatsAppChannel,
  deliveryStatusFor,
  phoneFromAddress,
  twimlReply,
  type TwilioMessages,
} from './twilio-channels.js';

const logLines: string[] = [];
const logger = createLogger({ write: (line: string) => void logLines.push(line) });

const FROM = '+27820000000';
const PHONE = '+27820000001';
const UNVERIFIED = '+27820000099';

const MESSAGE: OutgoingMessage = {
  title: 'New offer K4F2',
  body: '31 kg in Woodstock.',
  phoneText: 'FEDSA: New offer K4F2. 31 kg in Woodstock. Reply YES K4F2 to claim.',
  href: '/recipient/offers/0123456789abcdef01234567',
};

/** stands in for the Twilio client. it refuses `UNVERIFIED` the way a trial account does */
function fakeMessages() {
  const created: Record<string, unknown>[] = [];
  const messages: TwilioMessages = {
    async create(params) {
      if (params.to.endsWith(UNVERIFIED)) {
        throw Object.assign(new Error(`The number ${UNVERIFIED} is unverified`), {
          code: 21608,
          status: 400,
        });
      }
      created.push(params);
      return { sid: `SM${String(created.length).padStart(32, '0')}`, status: 'queued' };
    },
  };
  return { messages, created };
}

describe('SMS', () => {
  test('sends the phone text from the configured number, with no media', async () => {
    const fake = fakeMessages();
    const channel = new TwilioSmsChannel(fake.messages, FROM, logger);

    const deliveries = await channel.send({ phone: PHONE, pushSubscriptions: [] }, MESSAGE);

    expect(fake.created).toEqual([{ to: PHONE, from: FROM, body: MESSAGE.phoneText }]);
    expect(deliveries).toEqual([
      { to: PHONE, status: 'queued', providerMessageId: `SM${'1'.padStart(32, '0')}`, gone: false },
    ]);
  });

  test('a refused number is recorded as failed and nothing is thrown', async () => {
    logLines.length = 0;
    const channel = new TwilioSmsChannel(fakeMessages().messages, FROM, logger);

    const deliveries = await channel.send({ phone: UNVERIFIED, pushSubscriptions: [] }, MESSAGE);

    expect(deliveries).toEqual([
      { to: UNVERIFIED, status: 'failed', providerMessageId: null, gone: false },
    ]);
    const logged = logLines.join('');
    expect(logged).toContain('21608');
    expect(logged).not.toContain(UNVERIFIED);
  });

  test('asks Twilio for delivery reports when given an address for them', async () => {
    const fake = fakeMessages();
    const callback = 'https://fedsa.example.org/api/webhooks/twilio/status';
    const channel = new TwilioSmsChannel(fake.messages, FROM, logger, callback);

    await channel.send({ phone: PHONE, pushSubscriptions: [] }, MESSAGE);

    expect(fake.created).toEqual([
      { to: PHONE, from: FROM, body: MESSAGE.phoneText, statusCallback: callback },
    ]);
  });

  test('without that address the request carries no callback at all', async () => {
    const fake = fakeMessages();
    await new TwilioSmsChannel(fake.messages, FROM, logger, null).send(
      { phone: PHONE, pushSubscriptions: [] },
      MESSAGE,
    );
    expect(fake.created[0]).not.toHaveProperty('statusCallback');
  });

  test('reaches only a person with a phone number', () => {
    const channel = new TwilioSmsChannel(fakeMessages().messages, FROM, logger);
    expect(channel.supports({ phone: null, pushSubscriptions: [] })).toBe(false);
    expect(channel.supports({ phone: PHONE, pushSubscriptions: [] })).toBe(true);
  });
});

describe('WhatsApp', () => {
  test('addresses both ends with the WhatsApp prefix and records the plain number', async () => {
    const fake = fakeMessages();
    const channel = new TwilioWhatsAppChannel(fake.messages, FROM, logger);

    const [delivery] = await channel.send({ phone: PHONE, pushSubscriptions: [] }, MESSAGE);

    expect(fake.created).toEqual([
      { to: `whatsapp:${PHONE}`, from: `whatsapp:${FROM}`, body: MESSAGE.phoneText },
    ]);
    expect(delivery).toMatchObject({ to: PHONE, status: 'queued' });
  });

  test('asks for delivery reports in the same way', async () => {
    const fake = fakeMessages();
    const callback = 'https://fedsa.example.org/api/webhooks/twilio/status';
    const channel = new TwilioWhatsAppChannel(fake.messages, FROM, logger, callback);

    await channel.send({ phone: PHONE, pushSubscriptions: [] }, MESSAGE);

    expect(fake.created[0]).toMatchObject({ to: `whatsapp:${PHONE}`, statusCallback: callback });
  });

  test('a sender already written with the prefix is not prefixed twice', async () => {
    const fake = fakeMessages();
    const channel = new TwilioWhatsAppChannel(fake.messages, `whatsapp:${FROM}`, logger);

    await channel.send({ phone: PHONE, pushSubscriptions: [] }, MESSAGE);

    expect(fake.created[0]).toMatchObject({ from: `whatsapp:${FROM}` });
  });
});

test.each([
  ['accepted', 'queued'],
  ['queued', 'queued'],
  ['sending', 'sent'],
  ['sent', 'sent'],
  ['delivered', 'delivered'],
  ['read', 'delivered'],
  ['undelivered', 'failed'],
  ['failed', 'failed'],
])('Twilio status %s is recorded as %s', (twilioStatus, expected) => {
  expect(deliveryStatusFor(twilioStatus)).toBe(expected);
});

test.each([
  ['+27820000001', '+27820000001'],
  ['whatsapp:+27820000001', '+27820000001'],
  [' +27820000001 ', '+27820000001'],
])('%j is the stored number %s', (address, phone) => {
  expect(phoneFromAddress(address)).toBe(phone);
});

test('a TwiML reply escapes the text it carries', () => {
  expect(twimlReply('FEDSA: <b> & co')).toBe(
    '<?xml version="1.0" encoding="UTF-8"?><Response><Message>FEDSA: &lt;b&gt; &amp; co</Message></Response>',
  );
});

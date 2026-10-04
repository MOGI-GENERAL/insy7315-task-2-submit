import { ErrorEnvelope, type Language, type OrganisationStatus } from '@fedsa/contract';
import { Types } from 'mongoose';
import twilio from 'twilio';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
  ClaimModel,
  NotificationModel,
  OfferModel,
  OrganisationModel,
  UserModel,
} from '../../src/db/index.js';
import { UNKNOWN_SENDER_REPLY, renderReply } from '../../src/notifications/templates.js';
import { REFERENCE_ALPHABET, REFERENCE_LENGTH } from '../../src/services/offer-reference.js';
import {
  TEST_TWILIO_WEBHOOKS,
  anonymousClient,
  createOrganisation,
  createUser,
  newNotificationService,
  startTestApp,
  twilioPost,
  twilioSignatureFor,
} from './test-app.js';
import { START_TIMEOUT_MS, startTestDb } from './test-db.js';

const INBOUND = '/api/webhooks/twilio/inbound';
const STATUS = '/api/webhooks/twilio/status';

/** fake numbers. +27 followed by a zero cannot reach a real phone */
const PHONE = '+27820000101';
const OTHER_PHONE = '+27820000102';
const UNKNOWN_PHONE = '+27820000199';
const TWILIO_NUMBER = '+27820000100';

const notifications = newNotificationService();

let stopTestDb: (() => Promise<void>) | undefined;
const closers: (() => Promise<void>)[] = [];
let baseUrl = '';
let unconfiguredUrl = '';

beforeAll(async () => {
  stopTestDb = await startTestDb();
  const main = await startTestApp([], undefined, notifications);
  const unconfigured = await startTestApp([], undefined, undefined, undefined, null);
  closers.push(main.close, unconfigured.close);
  baseUrl = main.baseUrl;
  unconfiguredUrl = unconfigured.baseUrl;
}, START_TIMEOUT_MS);

afterAll(async () => {
  await notifications.whenIdle();
  for (const close of closers) await close();
  await stopTestDb?.();
});

beforeEach(async () => {
  // a claim notifies in the background, which must not write into the next test
  await notifications.whenIdle();
  await Promise.all([
    OrganisationModel.deleteMany({}),
    UserModel.deleteMany({}),
    OfferModel.deleteMany({}),
    ClaimModel.deleteMany({}),
    NotificationModel.deleteMany({}),
  ]);
});

const HOUR = 60 * 60 * 1000;
let count = 0;

function nextSid() {
  count += 1;
  return `SM${String(count).padStart(32, '0')}`;
}

/** unique and in the real format, which a reply has to match. never starts with Z */
function nextReference() {
  count += 1;
  let rest = count;
  let reference = '';
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    reference = REFERENCE_ALPHABET[rest % REFERENCE_ALPHABET.length] + reference;
    rest = Math.floor(rest / REFERENCE_ALPHABET.length);
  }
  return reference;
}

/** an open ambient offer from a donor in Woodstock, where test recipients are too */
async function openOffer(fields: { coldChain?: 'ambient' | 'refrigerated' } = {}) {
  const donor = await createOrganisation({ type: 'donor' });
  return OfferModel.create({
    donorOrganisationId: donor._id,
    postedByUserId: new Types.ObjectId(),
    reference: nextReference(),
    title: '62 loaves and 40 rolls',
    description: null,
    category: 'bakery',
    offeredQuantityKg: 31,
    coldChain: fields.coldChain ?? 'ambient',
    photoUrls: [],
    availableFrom: new Date(Date.now() - HOUR),
    collectionDeadline: new Date(Date.now() + 3 * HOUR),
    status: 'open',
  });
}

async function recipient(
  fields: {
    phone?: string;
    languagePreference?: Language;
    status?: OrganisationStatus;
    hasTransport?: boolean;
  } = {},
) {
  const organisation = await createOrganisation({
    type: 'recipient',
    status: fields.status,
    hasTransport: fields.hasTransport,
  });
  const user = await createUser({
    role: 'recipient',
    organisationId: organisation._id,
    phone: fields.phone ?? PHONE,
    languagePreference: fields.languagePreference,
  });
  return { organisation, user };
}

/** a reply as Twilio posts it, with the fields the signature has to cover besides the three read */
function inboundForm(from: string, body: string, messageSid = nextSid()) {
  return {
    AccountSid: `AC${'0'.repeat(32)}`,
    MessageSid: messageSid,
    From: from,
    To: from.startsWith('whatsapp:') ? `whatsapp:${TWILIO_NUMBER}` : TWILIO_NUMBER,
    Body: body,
    NumMedia: '0',
  };
}

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

/** the text of the one message in a TwiML reply */
async function replyOf(pending: Promise<Response>) {
  const res = await pending;
  const xml = await res.text();
  expect(res.status, xml).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/xml');
  const messages = [...xml.matchAll(/<Message>([^<]*)<\/Message>/g)];
  expect(messages).toHaveLength(1);
  return messages[0]![1]!.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]!);
}

const reply = (from: string, body: string) =>
  replyOf(twilioPost(baseUrl, INBOUND, inboundForm(from, body)));

function claimedReply(offer: { reference: string; collectionDeadline: Date }, language: Language) {
  return renderReply('claimed', language, {
    reference: offer.reference,
    pickupAddress: '12 Long Street, Woodstock',
    contactName: 'Test Contact',
    contactPhone: '+27820000000',
    deadline: offer.collectionDeadline.toISOString(),
  });
}

async function errorOf(pending: Promise<Response>) {
  const res = await pending;
  return { status: res.status, error: ErrorEnvelope.parse(await res.json()).error };
}

describe('claiming by reply', () => {
  test('an SMS reply claims the offer for the sender organisation, as the app would', async () => {
    const offer = await openOffer();
    const { organisation, user } = await recipient();

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(claimedReply(offer, 'en'));

    const claims = await ClaimModel.find({ offerId: offer._id });
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      recipientOrganisationId: organisation._id,
      claimedByUserId: user._id,
      status: 'active',
    });
    expect((await OfferModel.findById(offer._id))?.status).toBe('claimed');
  });

  test('a WhatsApp reply is matched without its whatsapp: prefix', async () => {
    const offer = await openOffer();
    await recipient();

    expect(await reply(`whatsapp:${PHONE}`, `YES ${offer.reference}`)).toBe(
      claimedReply(offer, 'en'),
    );
    expect(await ClaimModel.countDocuments({ offerId: offer._id, status: 'active' })).toBe(1);
  });

  test.each([
    ['lower case', (ref: string) => `yes ${ref.toLowerCase()}`],
    ['mixed case and extra spaces', (ref: string) => `  Yes   ${ref.toLowerCase()}  `],
    ['no space', (ref: string) => `YES${ref}`],
    ['a line break', (ref: string) => `yes\n${ref}`],
    ['spaces inside the reference', (ref: string) => `YES ${ref.split('').join(' ')}`],
  ])('a reply with %s still claims', async (_label, write) => {
    const offer = await openOffer();
    await recipient();

    expect(await reply(PHONE, write(offer.reference))).toBe(claimedReply(offer, 'en'));
    expect(await ClaimModel.countDocuments({ offerId: offer._id })).toBe(1);
  });

  test('transport is asked for when the organisation has recorded no vehicle', async () => {
    const withoutVehicle = await openOffer();
    const withVehicle = await openOffer();
    await recipient({ hasTransport: false });
    await recipient({ phone: OTHER_PHONE, hasTransport: true });

    await reply(PHONE, `YES ${withoutVehicle.reference}`);
    await reply(OTHER_PHONE, `YES ${withVehicle.reference}`);

    expect((await ClaimModel.findOne({ offerId: withoutVehicle._id }))?.transportNeeded).toBe(true);
    expect((await ClaimModel.findOne({ offerId: withVehicle._id }))?.transportNeeded).toBe(false);
  });

  test('the same reply delivered again keeps the one claim and answers the same', async () => {
    const offer = await openOffer();
    await recipient();
    const form = inboundForm(PHONE, `YES ${offer.reference}`);

    const first = await replyOf(twilioPost(baseUrl, INBOUND, form));
    const again = await replyOf(twilioPost(baseUrl, INBOUND, form));
    const together = await Promise.all(
      [1, 2, 3].map(() => replyOf(twilioPost(baseUrl, INBOUND, form))),
    );

    expect([first, again, ...together]).toEqual(Array(5).fill(claimedReply(offer, 'en')));
    expect(await ClaimModel.countDocuments({ offerId: offer._id })).toBe(1);
  });
});

describe('replies that claim nothing', () => {
  test('an offer another organisation already holds', async () => {
    const offer = await openOffer();
    await recipient();
    await recipient({ phone: OTHER_PHONE });
    await reply(OTHER_PHONE, `YES ${offer.reference}`);

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(
      renderReply('unavailable', 'en', { reference: offer.reference }),
    );
    expect(await ClaimModel.countDocuments({ offerId: offer._id })).toBe(1);
  });

  test('a reference no offer has gets the same answer as a taken offer', async () => {
    await recipient();

    expect(await reply(PHONE, 'YES ZZZZ')).toBe(
      renderReply('unavailable', 'en', { reference: 'ZZZZ' }),
    );
  });

  test('an organisation that is not yet verified cannot claim', async () => {
    const offer = await openOffer();
    await recipient({ status: 'pending' });

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(
      renderReply('unavailable', 'en', { reference: offer.reference }),
    );
    expect(await ClaimModel.countDocuments({})).toBe(0);
    expect((await OfferModel.findById(offer._id))?.status).toBe('open');
  });

  test('an organisation the offer is not eligible for cannot claim it', async () => {
    const offer = await openOffer({ coldChain: 'refrigerated' });
    await recipient();

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(
      renderReply('unavailable', 'en', { reference: offer.reference }),
    );
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });

  test.each([['please send bread'], ['YES'], ['no thanks W001'], ['']])(
    '%j is not understood',
    async (body) => {
      await openOffer();
      await recipient({ languagePreference: 'af' });

      expect(await reply(PHONE, body)).toBe(renderReply('not_understood', 'af', {}));
      expect(await ClaimModel.countDocuments({})).toBe(0);
    },
  );

  test('a number no user has gets a reply that names no account or offer', async () => {
    const offer = await openOffer();
    await recipient();

    const text = await reply(UNKNOWN_PHONE, `YES ${offer.reference}`);

    expect(text).toBe(UNKNOWN_SENDER_REPLY);
    expect(text).not.toContain(offer.reference);
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });

  test('a disabled user and FEDSA staff are unknown numbers', async () => {
    const offer = await openOffer();
    const { organisation } = await recipient({ phone: OTHER_PHONE });
    await createUser({
      role: 'recipient',
      organisationId: organisation._id,
      phone: PHONE,
      status: 'disabled',
    });
    await createUser({ role: 'coordinator', phone: UNKNOWN_PHONE });

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(UNKNOWN_SENDER_REPLY);
    expect(await reply(UNKNOWN_PHONE, `YES ${offer.reference}`)).toBe(UNKNOWN_SENDER_REPLY);
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });
});

describe('shared phones', () => {
  test('a phone shared within one organisation claims as its longest-standing user', async () => {
    const offer = await openOffer();
    const { organisation, user: first } = await recipient({ languagePreference: 'xh' });
    await createUser({ role: 'recipient', organisationId: organisation._id, phone: PHONE });

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(claimedReply(offer, 'xh'));
    expect((await ClaimModel.findOne({ offerId: offer._id }))?.claimedByUserId).toEqual(first._id);
  });

  test('a phone shared by two organisations claims for neither', async () => {
    const offer = await openOffer();
    await recipient();
    await recipient();

    expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(UNKNOWN_SENDER_REPLY);
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });
});

describe('languages', () => {
  test.each(['en', 'af', 'xh'] as const)(
    'every answer to a %s speaker is in %s',
    async (language) => {
      const offer = await openOffer();
      await recipient({ languagePreference: language });
      await recipient({ phone: OTHER_PHONE });

      expect(await reply(PHONE, `YES ${offer.reference}`)).toBe(claimedReply(offer, language));
      expect(await reply(PHONE, 'hello')).toBe(renderReply('not_understood', language, {}));

      const taken = await openOffer();
      await reply(OTHER_PHONE, `YES ${taken.reference}`);
      expect(await reply(PHONE, `YES ${taken.reference}`)).toBe(
        renderReply('unavailable', language, { reference: taken.reference }),
      );
    },
  );
});

describe('signatures', () => {
  test('a request with no signature is refused and changes nothing', async () => {
    const offer = await openOffer();
    await recipient();

    const res = await errorOf(
      twilioPost(baseUrl, INBOUND, inboundForm(PHONE, `YES ${offer.reference}`), null),
    );

    expect(res).toMatchObject({ status: 403, error: { code: 'FORBIDDEN' } });
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });

  test('a wrong signature, one for a changed body or one for another address is refused', async () => {
    const offer = await openOffer();
    await recipient();
    const form = inboundForm(PHONE, `YES ${offer.reference}`);
    const signatures = [
      'bm90IGEgc2lnbmF0dXJl',
      twilioSignatureFor(INBOUND, { ...form, Body: 'YES ZZZZ' }),
      // the address the API listens on, which Twilio never calls
      twilio.getExpectedTwilioSignature(
        TEST_TWILIO_WEBHOOKS.authToken,
        `${baseUrl}${INBOUND}`,
        form,
      ),
    ];

    for (const signature of signatures) {
      const res = await errorOf(twilioPost(baseUrl, INBOUND, form, signature));
      expect(res).toMatchObject({ status: 403, error: { code: 'FORBIDDEN' } });
    }
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });

  test('without Twilio settings both routes refuse even a correctly signed request', async () => {
    const offer = await openOffer();
    await recipient();

    const inbound = await errorOf(
      twilioPost(unconfiguredUrl, INBOUND, inboundForm(PHONE, `YES ${offer.reference}`)),
    );
    const status = await errorOf(
      twilioPost(unconfiguredUrl, STATUS, { MessageSid: nextSid(), MessageStatus: 'delivered' }),
    );

    expect(inbound).toMatchObject({ status: 403, error: { code: 'FORBIDDEN' } });
    expect(status).toMatchObject({ status: 403, error: { code: 'FORBIDDEN' } });
    expect(await ClaimModel.countDocuments({})).toBe(0);
  });

  test('a signed request missing a field the contract needs is a validation error', async () => {
    const res = await errorOf(twilioPost(baseUrl, INBOUND, { MessageSid: nextSid(), From: PHONE }));
    expect(res).toMatchObject({ status: 400, error: { code: 'VALIDATION_FAILED' } });
  });

  test('other routes still refuse a form body', async () => {
    const client = await anonymousClient(baseUrl);
    const res = await errorOf(
      client.request(
        'POST',
        '/api/auth/login',
        new URLSearchParams({ email: 'someone@example.org', password: 'a long password' }),
      ),
    );
    expect(res).toMatchObject({ status: 400, error: { code: 'VALIDATION_FAILED' } });
  });
});

describe('delivery reports', () => {
  async function smsRow(providerMessageId: string, deliveryStatus: 'queued' | 'sent' = 'queued') {
    return NotificationModel.create({
      to: PHONE,
      kind: 'offer_posted',
      channel: 'sms',
      title: 'New offer W001',
      body: 'FEDSA: New offer W001. 31 kg in Woodstock.',
      deliveryStatus,
      providerMessageId,
      sentAt: new Date(),
    });
  }

  const report = (MessageSid: string, MessageStatus: string) =>
    twilioPost(baseUrl, STATUS, {
      AccountSid: `AC${'0'.repeat(32)}`,
      MessageSid,
      MessageStatus,
      To: PHONE,
    });

  test('a report updates the row that has its message id, through the status mapping', async () => {
    const sid = nextSid();
    const row = await smsRow(sid);
    const other = await smsRow(nextSid());

    const res = await report(sid, 'delivered');

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect((await NotificationModel.findById(row._id))?.deliveryStatus).toBe('delivered');
    expect((await NotificationModel.findById(other._id))?.deliveryStatus).toBe('queued');
  });

  test.each([
    ['sent', 'sent'],
    ['undelivered', 'failed'],
    ['read', 'delivered'],
  ])('Twilio status %s is stored as %s', async (twilioStatus, stored) => {
    const sid = nextSid();
    const row = await smsRow(sid);

    expect((await report(sid, twilioStatus)).status).toBe(204);
    expect((await NotificationModel.findById(row._id))?.deliveryStatus).toBe(stored);
  });

  test('a late report never moves a row back', async () => {
    const sid = nextSid();
    const row = await smsRow(sid, 'sent');

    await report(sid, 'delivered');
    await report(sid, 'sent');

    expect((await NotificationModel.findById(row._id))?.deliveryStatus).toBe('delivered');
  });

  test('a report for a message no row has is accepted and changes nothing', async () => {
    const row = await smsRow(nextSid());

    const res = await report(nextSid(), 'delivered');

    expect(res.status).toBe(204);
    expect((await NotificationModel.findById(row._id))?.toObject()).toEqual(row.toObject());
  });

  test('an unsigned report is refused and changes nothing', async () => {
    const sid = nextSid();
    const row = await smsRow(sid);

    const res = await errorOf(
      twilioPost(baseUrl, STATUS, { MessageSid: sid, MessageStatus: 'delivered' }, null),
    );

    expect(res).toMatchObject({ status: 403, error: { code: 'FORBIDDEN' } });
    expect((await NotificationModel.findById(row._id))?.deliveryStatus).toBe('queued');
  });
});

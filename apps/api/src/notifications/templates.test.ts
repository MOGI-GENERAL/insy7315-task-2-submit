import { Language, NotificationKind } from '@fedsa/contract';
import { describe, expect, test } from 'vitest';
import { UNKNOWN_SENDER_REPLY, renderMessage, renderReply, type MessageData } from './templates.js';

/** 15:00 UTC is 17:00 in Cape Town */
const DEADLINE = '2026-10-03T15:00:00.000Z';

const OFFER = { reference: 'K4F2', quantityKg: 31, suburb: 'Woodstock', deadline: DEADLINE };

const DATA: MessageData = {
  offer_posted: OFFER,
  offer_claimed: { ...OFFER, claimedBy: 'Siyakhula Shelter' },
  claim_released: { ...OFFER, releasedBy: 'Siyakhula Shelter' },
  handover_confirmed: { reference: 'K4F2', quantityKg: 29.5 },
  driver_dispatched: {
    reference: 'K4F2',
    pickupAddress: '12 Long Street, Woodstock',
    contactName: 'Riaan de Villiers',
    contactPhone: '+27820000001',
    deadline: DEADLINE,
    dropOffAddress: '4 Lansdowne Road, Khayelitsha',
  },
  verification: { organisationName: 'Siyakhula Shelter' },
  dispute: { reference: 'K4F2', organisationName: 'Siyakhula Shelter' },
  certificate_issued: {
    certificateNumber: 'FEDSA-2026-0001',
    periodStart: '2026-09-30T22:00:00.000Z',
    periodEnd: '2026-10-31T21:59:59.999Z',
  },
};

/** every value a kind is given that should reach the reader as it is */
const MUST_SHOW: Record<NotificationKind, string[]> = {
  offer_posted: ['K4F2', '31 kg', 'Woodstock', '17:00'],
  offer_claimed: ['K4F2', 'Siyakhula Shelter', '31 kg', '17:00'],
  claim_released: ['K4F2', 'Siyakhula Shelter', '17:00'],
  handover_confirmed: ['K4F2', 'kg'],
  driver_dispatched: [
    'K4F2',
    '12 Long Street, Woodstock',
    'Riaan de Villiers',
    '+27820000001',
    '17:00',
    '4 Lansdowne Road, Khayelitsha',
  ],
  verification: ['Siyakhula Shelter'],
  dispute: ['K4F2', 'Siyakhula Shelter'],
  certificate_issued: ['FEDSA-2026-0001', '1 Oct 2026', '31 Oct 2026'],
};

const CASES = Language.options.flatMap((language) =>
  NotificationKind.options.map((kind) => [kind, language] as const),
);

describe.each(CASES)('%s in %s', (kind, language) => {
  const message = renderMessage(kind, language, DATA[kind]);

  test('has a title and a body that fit a notification row', () => {
    expect(message.title.length).toBeGreaterThan(0);
    expect(message.title.length).toBeLessThanOrEqual(200);
    expect(message.body.length).toBeGreaterThan(0);
    expect(message.phoneText.length).toBeLessThanOrEqual(1600);
  });

  test('shows every detail it was given', () => {
    const text = `${message.title} ${message.body}`;
    for (const value of MUST_SHOW[kind]) expect(text).toContain(value);
  });

  test('the phone text carries the title and body and no link', () => {
    expect(message.phoneText).toContain(message.title);
    expect(message.phoneText).toContain(message.body);
    expect(message.phoneText).not.toMatch(/https?:\/\//);
  });
});

test('the three languages are different text', () => {
  const titles = Language.options.map((l) => renderMessage('offer_posted', l, OFFER).title);
  expect(new Set(titles).size).toBe(3);
});

test.each(Language.options)('an offer by phone in %s says how to claim it by reply', (language) => {
  const { phoneText, body } = renderMessage('offer_posted', language, OFFER);
  expect(phoneText).toContain('YES K4F2');
  expect(body).not.toContain('YES');
});

test.each(Language.options)('only an offer in %s asks for a reply', (language) => {
  const others = NotificationKind.options.filter((kind) => kind !== 'offer_posted');
  for (const kind of others) {
    expect(renderMessage(kind, language, DATA[kind]).phoneText).not.toContain('YES');
  }
});

test('a certificate notice is the English text in every language', () => {
  const english = renderMessage('certificate_issued', 'en', DATA.certificate_issued);
  for (const language of ['af', 'xh'] as const) {
    expect(renderMessage('certificate_issued', language, DATA.certificate_issued)).toEqual(english);
  }
});

test('the deadline is in South African time whatever the server time zone', () => {
  const lateEvening = renderMessage('offer_posted', 'en', {
    ...OFFER,
    deadline: '2026-10-03T21:30:00.000Z',
  });
  expect(lateEvening.body).toContain('23:30');
});

test('Afrikaans writes a decimal comma', () => {
  const { body } = renderMessage('handover_confirmed', 'af', DATA.handover_confirmed);
  expect(body).toContain('29,5 kg');
});

test('a claim notice without a claimant tells the reader the offer is gone', () => {
  for (const language of Language.options) {
    const message = renderMessage('offer_claimed', language, OFFER);
    expect(message.body).not.toContain('Siyakhula');
    expect(message.title).toContain('K4F2');
  }
});

const CLAIMED = {
  reference: 'K4F2',
  pickupAddress: '12 Long Street, Woodstock',
  contactName: 'Riaan de Villiers',
  contactPhone: '+27820000001',
  deadline: DEADLINE,
};

describe.each(Language.options)('replies to a claim in %s', (language) => {
  test('a claim names the offer, where to collect, by when and whom to call', () => {
    const text = renderReply('claimed', language, CLAIMED);
    for (const value of [
      'K4F2',
      '12 Long Street, Woodstock',
      '17:00',
      'Riaan de Villiers',
      '+27820000001',
    ]) {
      expect(text).toContain(value);
    }
  });

  test('an unavailable offer is named, and nothing says why', () => {
    const text = renderReply('unavailable', language, { reference: 'K4F2' });
    expect(text).toContain('K4F2');
  });

  test('a reply that was not understood says how to claim', () => {
    expect(renderReply('not_understood', language, {})).toContain('YES');
  });

  test('every reply starts with the sender name and fits one message', () => {
    for (const text of [
      renderReply('claimed', language, CLAIMED),
      renderReply('unavailable', language, { reference: 'K4F2' }),
      renderReply('not_understood', language, {}),
    ]) {
      expect(text.startsWith('FEDSA: ')).toBe(true);
      expect(text.length).toBeLessThanOrEqual(1600);
    }
  });
});

test('the three languages reply with different text', () => {
  const replies = Language.options.map((l) => renderReply('not_understood', l, {}));
  expect(new Set(replies).size).toBe(3);
});

test('the reply to an unknown number names no offer and no account', () => {
  expect(UNKNOWN_SENDER_REPLY).not.toMatch(/YES [A-Z0-9]{4}/);
  expect(UNKNOWN_SENDER_REPLY.startsWith('FEDSA: ')).toBe(true);
});

import { describe, expect, test } from 'vitest';
import { renderMessage } from '../../../api/src/notifications/templates';
import { driverText } from './driverText';

/**
 * the SMS is rendered in English, because nothing is known about the driver's language.
 * importing the API's own template keeps the two from drifting apart
 */
const parts = {
  reference: 'K4F2',
  deadline: '2026-10-03T15:00:00.000Z',
  pickupAddress: '12 Long Street, Woodstock',
  contactName: 'Riaan de Villiers',
  contactPhone: '+27820000001',
  dropOffAddress: '4 Lansdowne Road, Khayelitsha',
  link: 'https://web.example.org/c/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCde',
};

describe('driver text', () => {
  test('matches the SMS the API sends, link included', () => {
    const sms = renderMessage('driver_dispatched', 'en', {
      reference: parts.reference,
      pickupAddress: parts.pickupAddress,
      contactName: parts.contactName,
      contactPhone: parts.contactPhone,
      deadline: parts.deadline,
      dropOffAddress: parts.dropOffAddress,
      link: parts.link,
    });
    expect(driverText(parts)).toBe(sms.phoneText);
  });

  test('ends with the link', () => {
    expect(driverText(parts).endsWith(` Details: ${parts.link}`)).toBe(true);
  });
});

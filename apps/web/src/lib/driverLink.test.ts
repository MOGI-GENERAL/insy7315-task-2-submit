import { describe, expect, test } from 'vitest';
import { RotateDriverLinkRequest } from '@fedsa/contract';
import { dispatchedByUs, mapsLink, mintDriverToken } from './driverLink';

describe('mintDriverToken', () => {
  test('makes a token the contract accepts', () => {
    for (let i = 0; i < 500; i++) {
      const driverToken = mintDriverToken();
      expect(RotateDriverLinkRequest.safeParse({ driverToken }).success).toBe(true);
    }
  });

  test('makes a different token each time', () => {
    const tokens = new Set(Array.from({ length: 100 }, mintDriverToken));
    expect(tokens.size).toBe(100);
  });
});

describe('dispatchedByUs', () => {
  const ours = { dispatchedByUserId: 'usr-nadia', driverPhone: '+27821112222' };
  const request = { driverPhone: '+27821112222' };

  test('a new collection is ours', () => {
    expect(dispatchedByUs({ created: true, collection: ours }, request, 'usr-nadia')).toBe(true);
  });

  test('a repeat of our own post that got through is ours', () => {
    expect(dispatchedByUs({ created: false, collection: ours }, request, 'usr-nadia')).toBe(true);
  });

  test('a collection another coordinator dispatched first is not ours', () => {
    const theirs = { ...ours, dispatchedByUserId: 'usr-sam' };
    expect(dispatchedByUs({ created: false, collection: theirs }, request, 'usr-nadia')).toBe(false);
  });

  test('our earlier dispatch to a different driver is not this one', () => {
    const earlier = { ...ours, driverPhone: '+27829998888' };
    expect(dispatchedByUs({ created: false, collection: earlier }, request, 'usr-nadia')).toBe(
      false,
    );
  });
});

test('the maps link encodes the address', () => {
  const url = new URL(mapsLink('12 Long Street, Woodstock & more'));
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/');
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('query')).toBe('12 Long Street, Woodstock & more');
});

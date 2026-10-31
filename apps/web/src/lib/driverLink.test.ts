import { describe, expect, test } from 'vitest';
import { DriverToken } from '@fedsa/contract';
import { mapsLink, mintDriverToken } from './driverLink';

describe('mintDriverToken', () => {
  test('makes a token the contract accepts', () => {
    for (let i = 0; i < 50; i++) expect(DriverToken.safeParse(mintDriverToken()).success).toBe(true);
  });

  test('makes a different token each time', () => {
    const tokens = new Set(Array.from({ length: 100 }, mintDriverToken));
    expect(tokens.size).toBe(100);
  });
});

test('the maps link encodes the address', () => {
  const url = new URL(mapsLink('12 Long Street, Woodstock & more'));
  expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/');
  expect(url.searchParams.get('api')).toBe('1');
  expect(url.searchParams.get('query')).toBe('12 Long Street, Woodstock & more');
});

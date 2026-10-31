import { expect, test } from 'vitest';
import { parseWebOrigin } from './web-origin.js';

test.each([
  ['https://fedsa-mogi.netlify.app', 'https://fedsa-mogi.netlify.app'],
  ['https://fedsa-mogi.netlify.app/', 'https://fedsa-mogi.netlify.app'],
  ['http://localhost:5173', 'http://localhost:5173'],
])('accepts %s', (value, origin) => {
  expect(parseWebOrigin(value)).toBe(origin);
});

test.each([
  undefined,
  '',
  'fedsa.example.org',
  'http://fedsa.example.org',
  'https://a.org/app',
  'ftp://a.org',
])('treats %s as unset', (value) => {
  expect(parseWebOrigin(value)).toBeNull();
});

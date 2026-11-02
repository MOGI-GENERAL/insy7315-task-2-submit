import { expect, test } from 'vitest';
import config from '../../../netlify.toml?raw';

const siteHeaders = config.split('[[headers]]').find((block) => block.includes('for = "/*"')) ?? '';

test.each([
  ['Content-Security-Policy', /frame-ancestors 'none'/],
  ['X-Content-Type-Options', /^nosniff$/],
  ['Strict-Transport-Security', /^max-age=\d+/],
  ['Cross-Origin-Opener-Policy', /^same-origin$/],
  ['Cross-Origin-Resource-Policy', /^same-origin$/],
])('Netlify sends %s on every page', (name, value) => {
  const line = siteHeaders.match(new RegExp(`^\\s*${name} = "(.*)"$`, 'm'));
  expect(line?.[1]).toMatch(value);
});

const driverHeaders =
  config.split('[[headers]]').find((block) => block.includes('for = "/c/*"')) ?? '';

test.each([
  ['Referrer-Policy', /^no-referrer$/],
  ['X-Robots-Tag', /^noindex$/],
  ['Cache-Control', /^no-store$/],
])('Netlify sends %s on the driver page', (name, value) => {
  const line = driverHeaders.match(new RegExp(`^\\s*${name} = "(.*)"$`, 'm'));
  expect(line?.[1]).toMatch(value);
});

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

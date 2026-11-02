import { expect, test } from 'vitest';
import { browserLanguage } from './browserLanguage';

test('takes the first supported language, whatever the region', () => {
  expect(browserLanguage(['af-ZA', 'en'])).toBe('af');
  expect(browserLanguage(['fr-FR', 'xh', 'af'])).toBe('xh');
  expect(browserLanguage(['EN-us', 'af'])).toBe('en');
});

test('falls back to English', () => {
  expect(browserLanguage(['fr-FR', 'zu'])).toBe('en');
  expect(browserLanguage([])).toBe('en');
});

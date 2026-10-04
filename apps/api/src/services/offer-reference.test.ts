import { describe, expect, test } from 'vitest';
import { REFERENCE_ALPHABET, REFERENCE_LENGTH, newOfferReference } from './offer-reference.js';

const SAMPLE = Array.from({ length: 5000 }, newOfferReference);

describe('newOfferReference', () => {
  test('is four characters from the alphabet', () => {
    const pattern = new RegExp(`^[${REFERENCE_ALPHABET}]{${REFERENCE_LENGTH}}$`);

    expect(REFERENCE_LENGTH).toBe(4);
    for (const reference of SAMPLE) expect(reference).toMatch(pattern);
  });

  test('never uses characters that are easy to misread', () => {
    for (const character of ['0', 'O', '1', 'I', 'L']) {
      expect(REFERENCE_ALPHABET).not.toContain(character);
      expect(SAMPLE.join('')).not.toContain(character);
    }
  });

  test('is upper case, so a reply in either case matches after upper-casing', () => {
    for (const reference of SAMPLE) expect(reference).toBe(reference.toUpperCase());
  });

  test('uses the whole alphabet and rarely repeats', () => {
    expect(new Set(SAMPLE.join('')).size).toBe(REFERENCE_ALPHABET.length);
    expect(new Set(SAMPLE).size).toBeGreaterThan(SAMPLE.length * 0.98);
  });
});

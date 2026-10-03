import { randomInt } from 'node:crypto';

/** no 0, O, 1, I or L, which are easy to misread when typed into a reply */
export const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const REFERENCE_LENGTH = 4;

/** short enough to type as `YES K4F2`. uniqueness comes from the index, not from here */
export function newOfferReference() {
  let reference = '';
  for (let i = 0; i < REFERENCE_LENGTH; i += 1) {
    reference += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return reference;
}

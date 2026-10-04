import { expect, test } from 'vitest';
import { parseClaimReply } from './webhook-service.js';

test.each([
  ['YES K4F2', 'K4F2'],
  ['yes k4f2', 'K4F2'],
  ['  Yes   K4f2 ', 'K4F2'],
  ['YESK4F2', 'K4F2'],
  ['yes\nk4f2', 'K4F2'],
  ['YES K 4 F 2', 'K4F2'],
  ['YES K4F2', 'K4F2'],
])('%j claims %s', (body, reference) => {
  expect(parseClaimReply(body)).toBe(reference);
});

test.each([
  ['YES'],
  ['yes please'],
  ['yes sure thing'],
  ['NO K4F2'],
  ['K4F2'],
  ['YES K4F2!'],
  ['YES K4F'],
  ['YES K4F2X'],
  ['YES K0F2'],
  [''],
])('%j is not a claim', (body) => {
  expect(parseClaimReply(body)).toBeNull();
});

import { describe, expect, test } from 'vitest';
import { dictionaries } from './dictionaries';
import type { StringKey } from './strings';
import { fill } from './useFormat';

const slots = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const keys = Object.keys(dictionaries.en) as StringKey[];

describe.each(['af', 'xh'] as const)('%s', (language) => {
  const dictionary = dictionaries[language];

  test('has no empty strings', () => {
    expect(keys.filter((key) => dictionary[key].trim() === '')).toEqual([]);
  });

  test('keeps every slot the English has', () => {
    const broken = keys.filter(
      (key) => slots(dictionary[key]).join() !== slots(dictionaries.en[key]).join(),
    );
    expect(broken).toEqual([]);
  });
});

describe('fill', () => {
  test('fills known slots and leaves unknown ones visible', () => {
    expect(fill('{h} h {m} min left', { h: 2, m: 5 })).toBe('2 h 5 min left');
    expect(fill('{n} days', {})).toBe('{n} days');
  });
});

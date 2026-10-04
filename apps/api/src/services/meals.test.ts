import { KG_PER_MEAL } from '@fedsa/contract';
import { describe, expect, test } from 'vitest';
import { roundKg, toMeals } from './meals.js';

describe('toMeals', () => {
  test('is 0.4 kg a meal', () => {
    expect(KG_PER_MEAL).toBe(0.4);
    expect(toMeals(0.4)).toBe(1);
    expect(toMeals(4)).toBe(10);
    expect(toMeals(5000)).toBe(12_500);
  });

  test('rounds down, never up', () => {
    expect(toMeals(0)).toBe(0);
    expect(toMeals(0.399)).toBe(0);
    expect(toMeals(0.799)).toBe(1);
    expect(toMeals(31)).toBe(77);
    expect(toMeals(52.7)).toBe(131);
  });

  test('gives whole meals where plain division lands just under them', () => {
    expect(Math.floor(1.2 / 0.4)).toBe(2);
    expect(toMeals(1.2)).toBe(3);
    expect(Math.floor(21.2 / 0.4)).toBe(52);
    expect(toMeals(21.2)).toBe(53);
  });

  test('reads a drifted sum as the gram it should be', () => {
    const kg = 20 + 7.5 + 15 + 1.2;
    expect(toMeals(kg)).toBe(109);
    expect(0.7 + 0.1).toBeLessThan(0.8);
    expect(toMeals(0.7 + 0.1)).toBe(2);
  });
});

describe('roundKg', () => {
  test('keeps the gram and drops the drift', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundKg(0.1 + 0.2)).toBe(0.3);
    expect(roundKg(12.3456)).toBe(12.346);
    expect(roundKg(18)).toBe(18);
  });
});

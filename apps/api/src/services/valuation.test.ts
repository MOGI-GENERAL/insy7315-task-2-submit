import { describe, expect, test } from 'vitest';
import { isWholeCents, valueByCategory } from './valuation.js';

describe('valueByCategory', () => {
  const rates = new Map([
    ['bakery', 25.4],
    ['produce', 18.35],
    ['dairy', 12.99],
  ] as const);

  test('adds kilograms per category and values each line to the cent', () => {
    const valuation = valueByCategory(
      [
        { category: 'dairy', collectedQuantityKg: 10 },
        { category: 'bakery', collectedQuantityKg: 12.5 },
        { category: 'produce', collectedQuantityKg: 37.5 },
        { category: 'bakery', collectedQuantityKg: 7.25 },
      ],
      rates,
    );

    // lines come in category order, whatever order the handovers were in
    expect(valuation.lines).toEqual([
      { category: 'bakery', quantityKg: 19.75, ratePerKg: 25.4, value: 501.65 },
      { category: 'produce', quantityKg: 37.5, ratePerKg: 18.35, value: 688.13 },
      { category: 'dairy', quantityKg: 10, ratePerKg: 12.99, value: 129.9 },
    ]);
    expect(valuation.totalQuantityKg).toBe(67.25);
    expect(valuation.totalValue).toBe(1319.68);
  });

  test('sums that drift in floating point still come out exact', () => {
    const valuation = valueByCategory(
      [
        { category: 'produce', collectedQuantityKg: 0.1 },
        { category: 'produce', collectedQuantityKg: 0.2 },
      ],
      rates,
    );
    expect(valuation.totalQuantityKg).toBe(0.3);
    // 0.3 kg at R18.35 is R5.505, which rounds up
    expect(valuation.totalValue).toBe(5.51);
  });
});

describe('isWholeCents', () => {
  test('accepts rand and cents, and refuses part of a cent', () => {
    expect(isWholeCents(18.35)).toBe(true);
    expect(isWholeCents(0.1)).toBe(true);
    expect(isWholeCents(22)).toBe(true);
    expect(isWholeCents(12.345)).toBe(false);
  });
});

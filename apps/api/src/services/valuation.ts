import { FoodCategory, type ValuationLine } from '@fedsa/contract';

const GRAMS_PER_KG = 1000;
const CENTS_PER_RAND = 100;

/** a rate in whole cents multiplies exactly, where 0.1 rand does not */
export function isWholeCents(rand: number) {
  const cents = rand * CENTS_PER_RAND;
  return Math.abs(cents - Math.round(cents)) < 1e-6;
}

export interface Valuation {
  lines: ValuationLine[];
  totalQuantityKg: number;
  totalValue: number;
}

/**
 * counted in whole grams and cents. the lines then add up to the totals exactly.
 * each line rounds to the nearest cent, and half a cent rounds up
 */
export function valueByCategory(
  handovers: { category: FoodCategory; collectedQuantityKg: number }[],
  rates: Map<FoodCategory, number>,
): Valuation {
  const gramsByCategory = new Map<FoodCategory, number>();
  for (const handover of handovers) {
    const grams = Math.round(handover.collectedQuantityKg * GRAMS_PER_KG);
    gramsByCategory.set(handover.category, (gramsByCategory.get(handover.category) ?? 0) + grams);
  }

  const lines: ValuationLine[] = [];
  let totalGrams = 0;
  let totalCents = 0;
  for (const category of FoodCategory.options) {
    const grams = gramsByCategory.get(category);
    if (grams === undefined) continue;
    const ratePerKg = rates.get(category)!;
    const cents = Math.round((grams * Math.round(ratePerKg * CENTS_PER_RAND)) / GRAMS_PER_KG);
    lines.push({
      category,
      quantityKg: grams / GRAMS_PER_KG,
      ratePerKg,
      value: cents / CENTS_PER_RAND,
    });
    totalGrams += grams;
    totalCents += cents;
  }

  return {
    lines,
    totalQuantityKg: totalGrams / GRAMS_PER_KG,
    totalValue: totalCents / CENTS_PER_RAND,
  };
}

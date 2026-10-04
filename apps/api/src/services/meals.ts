import { KG_PER_MEAL } from '@fedsa/contract';

const GRAMS_PER_KG = 1000;
const GRAMS_PER_MEAL = Math.round(KG_PER_MEAL * GRAMS_PER_KG);

/** sums of decimal kilograms drift. 43.7 can come back as 43.699999999999996 */
export function roundKg(kg: number) {
  return Math.round(kg * GRAMS_PER_KG) / GRAMS_PER_KG;
}

/** the only place meals are worked out. counted in whole grams, as plain division makes 1.2 kg 2 meals */
export function toMeals(kg: number) {
  return Math.floor(Math.round(kg * GRAMS_PER_KG) / GRAMS_PER_MEAL);
}

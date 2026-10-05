import { useCallback } from 'react';
import { useLanguageContext } from './context';
import { en } from './strings';
import type { StringKey } from './strings';
import type { ColdChain, FoodCategory, OfferStatus } from '../store/types';

export function useT() {
  const { dictionary } = useLanguageContext();
  return useCallback((key: StringKey) => dictionary[key] ?? en[key], [dictionary]);
}

export function useLanguage() {
  return useLanguageContext().language;
}

/* DOMAIN ENUM KEYS, TRANSLATED THROUGH THE SAME DICTIONARY */

export const categoryKey = (c: FoodCategory): StringKey =>
  (`cat.${c}` as StringKey);

export const coldChainKey = (c: ColdChain): StringKey =>
  (`cold.${c}` as StringKey);

export const statusKey = (s: OfferStatus): StringKey =>
  (`status.${s}` as StringKey);

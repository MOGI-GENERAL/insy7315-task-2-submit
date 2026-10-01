/* TRANSLATION HOOK; LANGUAGE LIVES IN APP STATE, NOT ITS OWN CONTEXT */

import { useCallback } from 'react';
import { useAppState } from '../store/context';
import { dictionaries } from './strings';
import type { StringKey } from './strings';
import type { ColdChain, FoodCategory, OfferStatus } from '../store/types';

export function useT() {
  const language = useAppState().language;
  return useCallback(
    (key: StringKey) => dictionaries[language][key] ?? dictionaries.en[key],
    [language],
  );
}

export function useLanguage() {
  return useAppState().language;
}

/* DOMAIN ENUM KEYS, TRANSLATED THROUGH THE SAME DICTIONARY */

export const categoryKey = (c: FoodCategory): StringKey =>
  (`cat.${c}` as StringKey);

export const coldChainKey = (c: ColdChain): StringKey =>
  (`cold.${c}` as StringKey);

export const statusKey = (s: OfferStatus): StringKey =>
  (`status.${s}` as StringKey);

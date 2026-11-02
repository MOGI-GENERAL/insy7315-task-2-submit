import { createContext, useContext } from 'react';
import type { Language } from '@fedsa/contract';
import type { Dictionary } from './strings';

export interface LanguageContextValue {
  language: Language;
  dictionary: Dictionary;
  /** `remember` false applies the language for this visit without storing it */
  setLanguage: (language: Language, remember?: boolean) => void;
}

export const LANGUAGE_STORAGE_KEY = 'fedsa.language';

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguageContext(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguageContext must be used inside <LanguageProvider>');
  return value;
}

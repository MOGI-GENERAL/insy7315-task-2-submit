import { createContext, useContext } from 'react';
import type { Language } from '@fedsa/contract';

export interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function useLanguageContext(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguageContext must be used inside <LanguageProvider>');
  return value;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Language } from '@fedsa/contract';
import { LanguageContext } from './context';
import { en, languageNames, loadDictionary, type Dictionary } from './strings';

const STORAGE_KEY = 'fedsa.language';

const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && value in languageNames;

/** remembered per device so the sign-in screen opens in the last language used */
function readStored(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setState] = useState<Language>(readStored);
  // null until a remembered Afrikaans or isiXhosa arrives. rendering nothing meanwhile avoids a flash of English
  const [dictionary, setDictionary] = useState<Dictionary | null>(() =>
    language === 'en' ? en : null,
  );

  useEffect(() => {
    document.documentElement.lang = language;
    let current = true;
    loadDictionary(language)
      // offline with the file never cached, English beats a blank screen
      .catch(() => en)
      .then((loaded) => {
        if (current) setDictionary(loaded);
      });
    return () => {
      current = false;
    };
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private windows can refuse storage, and the choice still lasts for this visit
    }
  }, []);

  const value = useMemo(
    () => (dictionary ? { language, dictionary, setLanguage } : null),
    [language, dictionary, setLanguage],
  );
  if (!value) return null;
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

import type { Language } from '@fedsa/contract';
import { languageNames } from './strings';

/** the first supported language in the browser's preference order, else English */
export function browserLanguage(preferred: readonly string[] = navigator.languages): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (Object.hasOwn(languageNames, base)) return base as Language;
  }
  return 'en';
}

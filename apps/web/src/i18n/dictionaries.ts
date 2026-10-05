import { af } from './af';
import { en } from './strings';
import { xh } from './xh';

/** all three at once, for tests. the app loads one at a time through `loadDictionary` */
export const dictionaries = { en, af, xh } as const;

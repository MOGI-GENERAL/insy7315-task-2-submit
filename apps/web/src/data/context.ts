import { createContext, useContext } from 'react';
import type { DataLayer } from './repositories';

export const DataContext = createContext<DataLayer | null>(null);

/** the repositories for whichever data mode this build runs in */
export function useData(): DataLayer {
  const data = useContext(DataContext);
  if (!data) throw new Error('useData must be used inside <DataProvider>');
  return data;
}

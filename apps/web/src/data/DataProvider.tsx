import type { ReactNode } from 'react';
import { DataContext } from './context';
import type { DataLayer } from './repositories';

export function DataProvider({ data, children }: { data: DataLayer; children: ReactNode }) {
  return <DataContext.Provider value={data}>{children}</DataContext.Provider>;
}

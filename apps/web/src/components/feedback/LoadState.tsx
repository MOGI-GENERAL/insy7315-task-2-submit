import type { ReactNode } from 'react';
import type { Loaded } from '../../data/useLoad';
import { ErrorState } from './ErrorState';
import { Loading } from './Loading';

export function LoadState<T>({
  result,
  isEmpty,
  empty,
  children,
}: {
  result: Loaded<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const { data, error, loading, reload } = result;
  if (error) return <ErrorState error={error} retry={reload} />;
  if (data === undefined) return loading ? <Loading /> : null;
  if (empty && isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}

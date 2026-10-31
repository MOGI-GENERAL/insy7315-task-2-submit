const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** an https origin, or http for a local host. null for anything else */
export function parseWebOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const allowed =
      url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname));
    return allowed && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

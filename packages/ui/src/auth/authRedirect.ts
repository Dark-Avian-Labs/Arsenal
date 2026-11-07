export const AUTH_REDIRECT_QUERY_PARAM = 'redirect_url';

export function safeAuthRedirectPath(path: string): string | null {
  // oxlint-disable-next-line no-control-regex
  if (!path.startsWith('/') || /[\u0000-\u001f\u007f]/.test(path)) return null;
  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin;
  try {
    const url = new URL(path, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : null;
  } catch {
    return null;
  }
}

export function buildAuthPagePath(basePath: string, returnTo: string): string {
  const safe = safeAuthRedirectPath(returnTo);
  if (!safe) return basePath;
  return `${basePath}?${AUTH_REDIRECT_QUERY_PARAM}=${encodeURIComponent(safe)}`;
}

export function getAuthRedirectUrl(searchParams: URLSearchParams, fallback: string): string {
  const fromQuery = searchParams.get(AUTH_REDIRECT_QUERY_PARAM);
  if (fromQuery) {
    const safe = safeAuthRedirectPath(fromQuery);
    if (safe) return safe;
  }
  return fallback;
}

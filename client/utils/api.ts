let cachedToken = '';
let authRedirectPending = false;

function currentAppPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

export function buildCentralAuthLoginUrl(nextPath?: string): string {
  const next = nextPath && nextPath.length > 0 ? nextPath : currentAppPath();
  return `/api/auth/login?next=${encodeURIComponent(next)}`;
}

export function redirectToCentralAuth(nextPath?: string): void {
  if (authRedirectPending) return;
  authRedirectPending = true;
  window.location.href = buildCentralAuthLoginUrl(nextPath);
}

async function getCsrfToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  try {
    const res = await fetch('/api/auth/csrf');
    if (res.ok) {
      const data = await res.json();
      cachedToken = (data.csrfToken as string) ?? '';
      return cachedToken;
    }
  } catch {
    // ignore
  }
  return '';
}

export function clearCsrfToken(): void {
  cachedToken = '';
}

export async function apiFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const needsCsrf =
    method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const headers = new Headers(init?.headers);

  if (needsCsrf) {
    const token = await getCsrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

  if (
    !headers.has('Content-Type') &&
    init?.body &&
    typeof init.body === 'string'
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) {
    redirectToCentralAuth();
  }
  return response;
}

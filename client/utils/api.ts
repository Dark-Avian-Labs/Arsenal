let cachedToken = '';

async function fetchCsrfToken(): Promise<string> {
  try {
    const res = await fetch('/api/csrf');
    if (res.ok) {
      const data = (await res.json()) as { csrfToken?: string };
      return data.csrfToken ?? '';
    }
  } catch {
    // ignore
  }
  return '';
}

async function getCsrfToken(): Promise<string> {
  if (!cachedToken) {
    cachedToken = await fetchCsrfToken();
  }
  return cachedToken;
}

export function clearCsrfToken(): void {
  cachedToken = '';
}

function isCsrfRejection(response: Response): boolean {
  return response.status === 403 && response.headers.get('X-CSRF-Error') === '1';
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const needsCsrf = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

  const buildHeaders = (token: string): Headers => {
    const headers = new Headers(init?.headers);
    if (needsCsrf && token) headers.set('X-CSRF-Token', token);
    if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }
    return headers;
  };

  const token = needsCsrf ? await getCsrfToken() : '';
  const response = await fetch(url, { ...init, headers: buildHeaders(token) });

  if (needsCsrf && isCsrfRejection(response)) {
    clearCsrfToken();
    const freshToken = await getCsrfToken();
    if (freshToken && freshToken !== token) {
      return fetch(url, { ...init, headers: buildHeaders(freshToken) });
    }
  }

  return response;
}

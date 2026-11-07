export class ApiError extends Error {
  readonly status: number;
  readonly fields: string[];
  readonly code: string | undefined;

  constructor(message: string, status: number, fields: string[] = [], code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
    this.code = code;
  }
}

export const API_UNAUTHORIZED_EVENT = 'dal:api-unauthorized';

export type ClerkTokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>;

let getClerkToken: ClerkTokenGetter | null = null;

export function setClerkTokenGetter(getter: ClerkTokenGetter | null): void {
  getClerkToken = getter;
}

async function resolveClerkToken(skipCache = false): Promise<string | null> {
  if (!getClerkToken) {
    return null;
  }
  try {
    const token = await getClerkToken({ skipCache });
    return token ?? null;
  } catch {
    return null;
  }
}

const API_TIMEOUT_MS = 15_000;

function withTimeout(init: RequestInit | undefined): AbortSignal | undefined {
  const signal = init?.signal ?? undefined;
  // Writes may stream or run long (optimizer, admin syncs); only reads get the default timeout.
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return signal;
  if (typeof AbortSignal.timeout !== 'function') return signal;
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

function isSameOrigin(url: string): boolean {
  const base = typeof location === 'undefined' ? 'http://localhost/' : location.href;
  try {
    return new URL(url, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function send(url: string, init: RequestInit | undefined, headers: Headers): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: withTimeout(init),
    headers,
    credentials: init?.credentials ?? 'include',
    cache: init?.cache ?? 'no-store',
  });
}

function withClerkAuthorization(headers: Headers, token: string | null): Headers {
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }
  return headers;
}

function withJsonContentType(headers: Headers, init?: RequestInit): Headers {
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = withJsonContentType(new Headers(init?.headers), init);

  const sameOrigin = isSameOrigin(url);
  let clerkToken = sameOrigin ? await resolveClerkToken(false) : null;
  if (sameOrigin) withClerkAuthorization(headers, clerkToken);

  let response = await send(url, init, headers);

  if (response.status === 401 && sameOrigin && getClerkToken) {
    const refreshed = await resolveClerkToken(true);
    if (refreshed && refreshed !== clerkToken) {
      clerkToken = refreshed;
      response = await send(url, init, withClerkAuthorization(new Headers(headers), clerkToken));
    }
  }

  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(API_UNAUTHORIZED_EVENT, { detail: { url } }));
  }

  return response;
}

export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  if (!res.ok) {
    let message = 'Request failed';
    let fields: string[] = [];
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: unknown; fields?: unknown; code?: unknown };
      if (typeof data.error === 'string' && data.error) message = data.error;
      if (typeof data.code === 'string' && data.code) code = data.code;
      if (Array.isArray(data.fields)) {
        fields = data.fields.filter((field): field is string => typeof field === 'string');
      }
    } catch {}
    throw new ApiError(message, res.status, fields, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

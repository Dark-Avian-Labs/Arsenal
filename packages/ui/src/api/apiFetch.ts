export class ApiError extends Error {
  readonly status: number;
  readonly fields: string[];

  constructor(message: string, status: number, fields: string[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
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

function send(url: string, init: RequestInit | undefined, headers: Headers): Promise<Response> {
  return fetch(url, {
    ...init,
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

  let clerkToken = await resolveClerkToken(false);
  withClerkAuthorization(headers, clerkToken);

  let response = await send(url, init, headers);

  if (response.status === 401 && getClerkToken) {
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
    try {
      const data = (await res.json()) as { error?: unknown; fields?: unknown };
      if (typeof data.error === 'string' && data.error) message = data.error;
      if (Array.isArray(data.fields)) {
        fields = data.fields.filter((field): field is string => typeof field === 'string');
      }
    } catch {}
    throw new ApiError(message, res.status, fields);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

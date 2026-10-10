export type ClerkTokenGetter = (options?: { skipCache?: boolean }) => Promise<string | null>;

let getClerkToken: ClerkTokenGetter | null = null;
export const API_UNAUTHORIZED_EVENT = 'armory:api-unauthorized';

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

function emitUnauthorized(url: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(API_UNAUTHORIZED_EVENT, {
      detail: { url },
    }),
  );
}

export type ApiErrorBody = {
  error?: string;
  message?: string;
  code?: string;
  errorCode?: string;
  error_code?: string;
};

export type ParsedApiError = {
  status: number;
  message: string;
  code?: string;
};

export async function parseApiError(
  response: Response,
  fallback = 'Request failed',
): Promise<ParsedApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.clone().json()) as ApiErrorBody;
  } catch {
    body = null;
  }

  const code = body?.code ?? body?.errorCode ?? body?.error_code;
  const message =
    (typeof body?.error === 'string' && body.error.trim()) ||
    (typeof body?.message === 'string' && body.message.trim()) ||
    fallback;

  return {
    status: response.status,
    message,
    code: typeof code === 'string' ? code : undefined,
  };
}

export async function readApiErrorMessage(
  response: Response,
  fallback = 'Request failed',
): Promise<string> {
  const parsed = await parseApiError(response, fallback);
  return parsed.message;
}

export class UnauthorizedError extends Error {
  readonly response: Response;
  readonly url: string;

  constructor(url: string, response: Response) {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
    this.url = url;
    this.response = response;
  }
}

function setJsonContentType(headers: Headers, init?: RequestInit): void {
  if (!headers.has('Content-Type') && init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as unknown;
      if (Array.isArray(parsed) || (parsed !== null && typeof parsed === 'object')) {
        headers.set('Content-Type', 'application/json');
      }
    } catch {
      // ignore
    }
  }
}

function withClerkAuthorization(headers: Headers, token: string | null): Headers {
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }
  return headers;
}

function send(
  url: string,
  init: RequestInit | undefined,
  headers: Headers,
  body: BodyInit | null | undefined,
): Promise<Response> {
  return fetch(url, {
    ...init,
    credentials: init?.credentials ?? 'include',
    cache: init?.cache ?? 'no-store',
    headers,
    body,
  });
}

function throwIfUnauthorized(url: string, response: Response): void {
  if (response.status === 401) {
    emitUnauthorized(url);
    throw new UnauthorizedError(url, response);
  }
}

export async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  setJsonContentType(headers, init);

  let clerkToken = await resolveClerkToken(false);
  withClerkAuthorization(headers, clerkToken);

  let response = await send(url, init, headers, init?.body);
  if (response.status === 401 && getClerkToken) {
    const refreshed = await resolveClerkToken(true);
    if (refreshed && refreshed !== clerkToken) {
      clerkToken = refreshed;
      response = await send(
        url,
        init,
        withClerkAuthorization(new Headers(headers), clerkToken),
        init?.body,
      );
    }
  }
  throwIfUnauthorized(url, response);
  return response;
}

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
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status, fields);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

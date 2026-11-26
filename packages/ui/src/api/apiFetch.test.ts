import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_UNAUTHORIZED_EVENT, ApiError, apiFetch, apiJson, setClerkTokenGetter } from './apiFetch';

function headersFromInit(init: RequestInit | undefined): Headers {
  return new Headers(init?.headers);
}

describe('apiFetch and apiJson', () => {
  afterEach(() => {
    setClerkTokenGetter(null);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a Clerk bearer token on same-origin requests and auto-sets JSON Content-Type for string bodies', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response('ok', { status: 200 });
    });
    setClerkTokenGetter(async () => 'fresh-session-token');

    const response = await apiFetch('/api/warframe/worksheets', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });

    expect(response.ok).toBe(true);
    expect(headersFromInit(capturedInit).get('Authorization')).toBe('Bearer fresh-session-token');
    expect(headersFromInit(capturedInit).get('Content-Type')).toBe('application/json');
    expect(capturedInit?.signal).toBeUndefined();
  });

  it('keeps the token off cross-origin URLs and sets a timeout signal on GET', async () => {
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      capturedInit = init;
      return new Response('ok', { status: 200 });
    });
    setClerkTokenGetter(async () => 'fresh-session-token');

    await apiFetch('https://evil.example/collect');

    expect(headersFromInit(capturedInit).has('Authorization')).toBe(false);
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries a 401 once after forcing a Clerk token refresh, but skips retry when token is null or unchanged', async () => {
    const capturedInits: RequestInit[] = [];
    vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
      if (init) capturedInits.push(init);
      if (capturedInits.length === 1) {
        return new Response('Unauthorized', { status: 401 });
      }
      return new Response('{"worksheets":[]}', { status: 200 });
    });

    const getter = vi.fn(async (options?: { skipCache?: boolean }) =>
      options?.skipCache ? 'refreshed-token' : 'stale-token',
    );
    setClerkTokenGetter(getter);

    const response = await apiFetch('/api/warframe/worksheets');
    expect(response.status).toBe(200);
    expect(capturedInits).toHaveLength(2);
    expect(getter).toHaveBeenNthCalledWith(1, { skipCache: false });
    expect(getter).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(headersFromInit(capturedInits[1]).get('Authorization')).toBe('Bearer refreshed-token');

    // Same token returned on refresh -> no redundant retry
    let sameCount = 0;
    vi.stubGlobal('fetch', async () => {
      sameCount += 1;
      return new Response('Unauthorized', { status: 401 });
    });
    setClerkTokenGetter(async () => 'same-token');
    expect((await apiFetch('/api/warframe/worksheets')).status).toBe(401);
    expect(sameCount).toBe(1);

    // Null token -> no retry + dispatches unauthorized event when window exists
    const dispatched: Event[] = [];
    vi.stubGlobal('window', {
      dispatchEvent: (ev: Event) => {
        dispatched.push(ev);
        return true;
      },
    });
    setClerkTokenGetter(async () => null);
    expect((await apiFetch('/api/warframe/worksheets')).status).toBe(401);
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]?.type).toBe(API_UNAUTHORIZED_EVENT);
  });

  it('apiJson parses JSON, returns undefined for 204, and throws structured ApiError on failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Invalid input', fields: ['name', 123], code: 'BAD' }), {
            status: 400,
          }),
        )
        .mockResolvedValueOnce(new Response('not json', { status: 502 })),
    );

    expect(await apiJson('/api/empty')).toBeUndefined();

    await expect(apiJson('/api/bad')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Invalid input',
      status: 400,
      fields: ['name'],
      code: 'BAD',
    });

    await expect(apiJson('/api/gateway')).rejects.toBeInstanceOf(ApiError);
  });
});

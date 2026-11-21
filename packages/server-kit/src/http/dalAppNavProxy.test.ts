import { afterEach, describe, expect, it, vi } from 'vitest';

import { handleDalAppNavProxy, resetDalAppNavCache } from './dalAppNavProxy.ts';

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const payload = Buffer.from('{"version":1,"updatedAt":"x","apps":[]}');

function okResponse(body: Uint8Array = payload) {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('handleDalAppNavProxy', () => {
  afterEach(() => {
    resetDalAppNavCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.DAL_APP_NAV_UPSTREAM_URL;
  });

  it('returns upstream JSON with a long cache', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse()),
    );
    const res = mockRes();
    await handleDalAppNavProxy({} as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['cache-control']).toBe('public, max-age=3600, stale-while-revalidate=86400');
    expect(Buffer.isBuffer(res.body) ? res.body.equals(payload) : false).toBe(true);
  });

  it('serves the cached copy, then the stale copy when upstream fails after expiry', async () => {
    const fetchMock = vi.fn(async () => okResponse());
    vi.stubGlobal('fetch', fetchMock);
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    await handleDalAppNavProxy({} as never, mockRes() as never);

    now.mockReturnValue(60 * 60 * 1000);
    const cachedRes = mockRes();
    await handleDalAppNavProxy({} as never, cachedRes as never);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedRes.statusCode).toBe(200);

    now.mockReturnValue(7 * 60 * 60 * 1000);
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const staleRes = mockRes();
    await handleDalAppNavProxy({} as never, staleRes as never);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(staleRes.statusCode).toBe(200);
    expect(Buffer.isBuffer(staleRes.body) ? staleRes.body.equals(payload) : false).toBe(true);
  });

  it('returns 502 when upstream is down and nothing is cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network');
      }),
    );
    const res = mockRes();
    await handleDalAppNavProxy({} as never, res as never);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: 'dal-app-nav upstream unavailable' });
  });

  it('rejects a body over 256 KB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse(new Uint8Array(256 * 1024 + 1))),
    );
    const res = mockRes();
    await handleDalAppNavProxy({} as never, res as never);

    expect(res.statusCode).toBe(502);
  });

  it('rejects non-JSON 200 responses and does not cache them', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('<html>502 Bad Gateway</html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      )
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const first = mockRes();
    await handleDalAppNavProxy({} as never, first as never);
    expect(first.statusCode).toBe(502);

    const second = mockRes();
    await handleDalAppNavProxy({} as never, second as never);
    expect(second.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent cold-cache upstream requests', async () => {
    let release!: () => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(okResponse());
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const a = mockRes();
    const b = mockRes();
    const p1 = handleDalAppNavProxy({} as never, a as never);
    const p2 = handleDalAppNavProxy({} as never, b as never);
    release();
    await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
  });
});

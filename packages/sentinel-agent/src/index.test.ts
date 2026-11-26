import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSentinelAgent } from './index.ts';

type PostedBatch = Array<Record<string, unknown>>;

function simulateRequest(
  middleware: ReturnType<typeof createSentinelAgent>['middleware'],
  opts: {
    method?: string;
    baseUrl?: string;
    routePath?: string;
    statusCode?: number;
    host?: string;
  } = {},
): void {
  const req = {
    method: opts.method ?? 'GET',
    baseUrl: opts.baseUrl ?? '',
    route: opts.routePath ? { path: opts.routePath } : undefined,
    headers: opts.host ? { host: opts.host } : {},
  } as unknown as Request;
  const res = Object.assign(new EventEmitter(), {
    statusCode: opts.statusCode ?? 200,
  }) as unknown as Response;

  middleware(req, res, () => {});
  res.emit('finish');
}

describe('createSentinelAgent', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('buckets HTTP requests by resolved app, normalized routePattern, and statusClass', async () => {
    vi.useFakeTimers();
    const batches: PostedBatch[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const parsed = JSON.parse(String(init?.body)) as { samples: PostedBatch };
        batches.push(parsed.samples);
        return new Response(null, { status: 204 });
      }),
    );

    const agent = createSentinelAgent({
      appId: 'arsenal',
      displayName: 'Arsenal',
      ingestUrl: 'http://127.0.0.1:3005/api/ingest',
      token: 'tok',
      flushIntervalMs: 1000,
      resolveRequestApp: (req) =>
        req.headers.host === 'armory.example'
          ? { appId: 'armory', displayName: 'Armory' }
          : { appId: 'codex', displayName: 'Codex' },
    });

    try {
      agent.start();
      simulateRequest(agent.middleware, {
        method: 'get',
        baseUrl: '/api/',
        routePath: '/builds/:id',
        statusCode: 200,
        host: 'armory.example',
      });
      simulateRequest(agent.middleware, {
        method: 'GET',
        baseUrl: '/api',
        routePath: 'builds/:id',
        statusCode: 201,
        host: 'armory.example',
      });
      simulateRequest(agent.middleware, {
        method: 'GET',
        statusCode: 404,
        host: 'codex.example',
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(batches).toHaveLength(1);
      const batch = batches[0]!;
      const processSample = batch.find((s) => s.kind === 'process');
      expect(processSample).toMatchObject({ appId: 'arsenal', status: 'online' });

      const armoryHttp = batch.find((s) => s.kind === 'http' && s.appId === 'armory');
      expect(armoryHttp).toMatchObject({
        method: 'GET',
        routePattern: '/api/builds/:id',
        statusClass: '2xx',
        count: 2,
      });

      const codexHttp = batch.find((s) => s.kind === 'http' && s.appId === 'codex');
      expect(codexHttp).toMatchObject({
        routePattern: '/unmatched',
        statusClass: '4xx',
        count: 1,
      });
    } finally {
      agent.stop();
    }
  });

  it('requeues failed flushes and reserves one slot for the current process heartbeat at the 200-sample cap', async () => {
    vi.useFakeTimers();
    let failFirst = true;
    const batches: PostedBatch[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (failFirst) {
          failFirst = false;
          return new Response('down', { status: 503 });
        }
        const parsed = JSON.parse(String(init?.body)) as { samples: PostedBatch };
        batches.push(parsed.samples);
        return new Response(null, { status: 204 });
      }),
    );

    const agent = createSentinelAgent({
      appId: 'codex',
      ingestUrl: 'http://127.0.0.1:3005/api/ingest',
      token: 'tok',
      flushIntervalMs: 1000,
    });

    try {
      agent.start();
      for (let i = 0; i < 205; i += 1) {
        simulateRequest(agent.middleware, { routePath: `/r/${i}`, statusCode: 200 });
      }
      await vi.advanceTimersByTimeAsync(1000);
      expect(batches).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1000);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(200);
      expect(batches[0]!.at(-1)).toMatchObject({ kind: 'process', appId: 'codex' });
    } finally {
      agent.stop();
    }
  });

  it('sends exit reports once even if noteGracefulExit and noteCrash are both called, and swallows errors', async () => {
    const fetchMock = vi.fn(async () => new Response('err', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    const agent = createSentinelAgent({
      appId: 'armory',
      ingestUrl: 'http://127.0.0.1:3005/api/ingest',
      token: 'tok',
    });

    try {
      await agent.noteGracefulExit('SIGTERM');
      await agent.noteCrash(new Error('secondary'));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(
        String(
          (fetchMock.mock.calls[0] as unknown[])[1]
            ? (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body
            : '{}',
        ),
      ) as {
        samples: PostedBatch;
      };
      expect(payload.samples[0]).toMatchObject({
        kind: 'exit',
        exitKind: 'graceful',
        exitCode: 0,
        signal: 'SIGTERM',
        source: 'agent',
      });
    } finally {
      agent.stop();
    }
  });
});

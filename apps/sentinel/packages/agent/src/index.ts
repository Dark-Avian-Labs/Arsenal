import { performance, PerformanceObserver, monitorEventLoopDelay } from 'node:perf_hooks';

import type { NextFunction, Request, RequestHandler, Response } from 'express';

export type SentinelAgentOptions = {
  appId: string;
  displayName?: string;
  ingestUrl: string;
  token: string;
  flushIntervalMs?: number;
};

type HttpBucket = {
  method: string;
  routePattern: string;
  statusClass: string;
  count: number;
  latencies: number[];
};

function percentile(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function statusClass(code: number): string {
  if (code >= 500) return '5xx';
  if (code >= 400) return '4xx';
  if (code >= 300) return '3xx';
  if (code >= 200) return '2xx';
  return '1xx';
}

function routePatternFrom(req: Request): string {
  const routePath = req.route && typeof req.route.path === 'string' ? req.route.path : null;
  if (routePath) {
    const base = req.baseUrl || '';
    return `${base}${routePatternNormalize(routePath)}`.replace(/\/{2,}/g, '/') || '/';
  }
  return 'unmatched';
}

function routePatternNormalize(routePath: string): string {
  return routePath.startsWith('/') ? routePath : `/${routePath}`;
}

async function postIngest(ingestUrl: string, token: string, samples: unknown[]): Promise<void> {
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ samples }),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`ingest ${res.status}`);
  }
}

function latenciesFinite(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

export function createSentinelAgent(options: SentinelAgentOptions): {
  middleware: RequestHandler;
  start: () => void;
  stop: () => void;
  noteGracefulExit: (signal?: string) => void;
  noteCrash: (err: unknown) => void;
} {
  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const httpBuckets = new Map<string, HttpBucket>();
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  const gcDurationsMs: number[] = [];
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (gcDurationsMs.length < 500) gcDurationsMs.push(entry.duration);
    }
  });
  gcObserver.observe({ entryTypes: ['gc'], buffered: false });

  let lastElu = performance.eventLoopUtilization();
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let exitSent = false;

  const flush = async () => {
    const samples: unknown[] = [];
    const mem = process.memoryUsage();
    const lagP50 = histogram.percentile(50) / 1e6;
    const lagP95 = histogram.percentile(95) / 1e6;
    const lagMax = histogram.max / 1e6;
    histogram.reset();

    const eluNow = performance.eventLoopUtilization(lastElu);
    lastElu = performance.eventLoopUtilization();
    const elu = latenciesFinite(eluNow.utilization);

    const gcSorted = [...gcDurationsMs].sort((a, b) => a - b);
    const gcP95Ms = percentile(gcSorted, 95);
    gcDurationsMs.length = 0;

    samples.push({
      kind: 'process',
      appId: options.appId,
      displayName: options.displayName ?? options.appId,
      ts: Date.now(),
      heapMb: mem.heapUsed / (1024 * 1024),
      heapTotalMb: mem.heapTotal / (1024 * 1024),
      heapExternalMb: mem.external / (1024 * 1024),
      rssMb: mem.rss / (1024 * 1024),
      lagP50Ms: latenciesFinite(lagP50),
      lagP95Ms: latenciesFinite(lagP95),
      lagMaxMs: latenciesFinite(lagMax),
      elu,
      uptimeSec: process.uptime(),
      gcP95Ms,
    });

    for (const bucket of httpBuckets.values()) {
      const sorted = [...bucket.latencies].sort((a, b) => a - b);
      samples.push({
        kind: 'http',
        appId: options.appId,
        displayName: options.displayName ?? options.appId,
        ts: Date.now(),
        method: bucket.method,
        routePattern: bucket.routePattern,
        statusClass: bucket.statusClass,
        count: bucket.count,
        latencyP50Ms: percentile(sorted, 50),
        latencyP95Ms: percentile(sorted, 95),
        latencyMaxMs: sorted[sorted.length - 1],
      });
    }
    httpBuckets.clear();

    await postIngest(options.ingestUrl, options.token, samples);
  };

  const sendExit = (
    exitKind: 'graceful' | 'crash',
    message?: string,
    exitCode?: number,
    signal?: string,
  ) => {
    if (exitSent) return;
    exitSent = true;
    void postIngest(options.ingestUrl, options.token, [
      {
        kind: 'exit',
        appId: options.appId,
        displayName: options.displayName ?? options.appId,
        ts: Date.now(),
        exitKind,
        exitCode,
        signal,
        message,
        source: 'agent',
      },
    ]).catch(() => {
      // ignore
    });
  };

  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      const method = req.method.toUpperCase();
      const routePattern = routePatternFrom(req);
      const cls = statusClass(res.statusCode);
      const key = `${method}\0${routePattern}\0${cls}`;
      const existing = httpBuckets.get(key);
      if (existing) {
        existing.count += 1;
        if (existing.latencies.length < 500) existing.latencies.push(elapsedMs);
      } else {
        httpBuckets.set(key, {
          method,
          routePattern,
          statusClass: cls,
          count: 1,
          latencies: [elapsedMs],
        });
      }
    });
    next();
  };

  return {
    middleware,
    start: () => {
      if (timer || stopped) return;
      timer = setInterval(() => {
        void flush().catch(() => {
          // ignore
        });
      }, flushIntervalMs);
    },
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      histogram.disable();
      gcObserver.disconnect();
    },
    noteGracefulExit: (signal) => sendExit('graceful', undefined, 0, signal),
    noteCrash: (err) => sendExit('crash', err instanceof Error ? err.message : String(err), 1),
  };
}

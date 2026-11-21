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

const MAX_LATENCY_SAMPLES = 500;
const MAX_PENDING_SAMPLES = 200;

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
  // Ingest routePattern must start with /. Static files and the HTML shell have no Express route.
  return '/unmatched';
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
    signal: AbortSignal.timeout(3000),
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
  noteGracefulExit: (signal?: string) => Promise<void>;
  noteCrash: (err: unknown) => Promise<void>;
} {
  const flushIntervalMs = options.flushIntervalMs ?? 15_000;
  const httpBuckets = new Map<string, HttpBucket>();
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  const gcDurationsMs: number[] = [];
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (gcDurationsMs.length < MAX_LATENCY_SAMPLES) gcDurationsMs.push(entry.duration);
    }
  });
  gcObserver.observe({ entryTypes: ['gc'], buffered: false });

  let lastElu = performance.eventLoopUtilization();
  let lastCpuUsage = process.cpuUsage();
  let lastCpuHrTime = process.hrtime.bigint();
  let pendingSamples: unknown[] = [];
  let flushing = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let exitReport: Promise<void> | null = null;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const httpSamples: unknown[] = [];
      const now = Date.now();
      const mem = process.memoryUsage();
      const lagP50 = histogram.percentile(50) / 1e6;
      const lagP95 = histogram.percentile(95) / 1e6;
      const lagMax = histogram.max / 1e6;
      histogram.reset();

      const eluNow = performance.eventLoopUtilization(lastElu);
      lastElu = performance.eventLoopUtilization();
      const elu = latenciesFinite(eluNow.utilization);

      const cpuDelta = process.cpuUsage(lastCpuUsage);
      const nowHr = process.hrtime.bigint();
      const elapsedUs = Number(nowHr - lastCpuHrTime) / 1000;
      lastCpuUsage = process.cpuUsage();
      lastCpuHrTime = nowHr;
      const cpuPct =
        elapsedUs > 0
          ? latenciesFinite(((cpuDelta.user + cpuDelta.system) / elapsedUs) * 100)
          : undefined;

      const gcSorted = [...gcDurationsMs].sort((a, b) => a - b);
      const gcP95Ms = percentile(gcSorted, 95);
      gcDurationsMs.length = 0;

      const processSample = {
        kind: 'process',
        appId: options.appId,
        displayName: options.displayName ?? options.appId,
        ts: now,
        cpu: cpuPct,
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
        status: 'online',
      };

      for (const bucket of httpBuckets.values()) {
        const sorted = [...bucket.latencies].sort((a, b) => a - b);
        httpSamples.push({
          kind: 'http',
          appId: options.appId,
          displayName: options.displayName ?? options.appId,
          ts: now,
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

      // Reserve one slot for the current process heartbeat so high-cardinality HTTP
      // buckets cannot evict it when the retry queue hits MAX_PENDING_SAMPLES.
      const nonProcessBudget = Math.max(0, MAX_PENDING_SAMPLES - 1);
      const nonProcess = [...pendingSamples, ...httpSamples].slice(-nonProcessBudget);
      const batch = [...nonProcess, processSample];
      pendingSamples = [];
      try {
        await postIngest(options.ingestUrl, options.token, batch);
      } catch (err) {
        pendingSamples = [...batch, ...pendingSamples].slice(-MAX_PENDING_SAMPLES);
        throw err;
      }
    } finally {
      flushing = false;
    }
  };

  const sendExit = (
    exitKind: 'graceful' | 'crash',
    message?: string,
    exitCode?: number,
    signal?: string,
  ): Promise<void> => {
    exitReport ??= postIngest(options.ingestUrl, options.token, [
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
    ]).catch(() => {});
    return exitReport;
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
        if (existing.latencies.length < MAX_LATENCY_SAMPLES) {
          existing.latencies.push(elapsedMs);
        } else {
          // Reservoir sample so busy windows reflect the whole interval instead of only its first 500 hits.
          const slot = Math.floor(Math.random() * existing.count);
          if (slot < MAX_LATENCY_SAMPLES) existing.latencies[slot] = elapsedMs;
        }
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
        void flush().catch(() => {});
      }, flushIntervalMs);
      timer.unref?.();
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

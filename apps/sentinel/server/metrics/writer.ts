import type Database from 'better-sqlite3';

import type { ExitEvent, HttpSample, ProcessSample } from './ingestSchema.js';

export type HostSample = {
  ts?: number;
  load1?: number;
  load5?: number;
  load15?: number;
  memUsedPct?: number;
  memTotalMb?: number;
  memFreeMb?: number;
};

function upsertApp(
  db: Database.Database,
  appId: string,
  displayName: string | undefined,
  pm2Name: string | undefined,
  ts: number,
  pmxModule?: boolean,
): void {
  // null keeps an existing flag. Agent and HTTP samples omit it; a later PM2 poll sets 0 or 1.
  const flag = pmxModule == null ? null : pmxModule ? 1 : 0;
  db.prepare(
    `INSERT INTO apps (id, display_name, pm2_name, pmx_module, updated_at)
     VALUES (?, ?, ?, COALESCE(?, 0), ?)
     ON CONFLICT(id) DO UPDATE SET
       display_name = COALESCE(excluded.display_name, apps.display_name),
       pm2_name = COALESCE(excluded.pm2_name, apps.pm2_name),
       pmx_module = COALESCE(?, apps.pmx_module),
       updated_at = excluded.updated_at`,
  ).run(appId, displayName || appId, pm2Name ?? null, flag, ts, flag);
}

export function writeProcessSample(db: Database.Database, sample: ProcessSample): void {
  const ts = sample.ts && sample.ts > 0 ? Math.floor(sample.ts) : Date.now();
  upsertApp(db, sample.appId, sample.displayName, sample.pm2Name, ts, sample.pmxModule);
  db.prepare(
    `INSERT INTO samples_raw (
      app_id, ts, cpu, rss_mb, heap_mb, heap_total_mb, heap_external_mb,
      lag_p50_ms, lag_p95_ms, lag_max_ms, elu, uptime_sec, gc_p95_ms, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sample.appId,
    ts,
    sample.cpu ?? null,
    sample.rssMb ?? null,
    sample.heapMb ?? null,
    sample.heapTotalMb ?? null,
    sample.heapExternalMb ?? null,
    sample.lagP50Ms ?? null,
    sample.lagP95Ms ?? null,
    sample.lagMaxMs ?? null,
    sample.elu ?? null,
    sample.uptimeSec ?? null,
    sample.gcP95Ms ?? null,
    sample.status ?? null,
  );
}

export function writeHttpSample(db: Database.Database, sample: HttpSample): void {
  const ts = sample.ts && sample.ts > 0 ? Math.floor(sample.ts) : Date.now();
  upsertApp(db, sample.appId, sample.displayName, undefined, ts);
  db.prepare(
    `INSERT INTO http_raw (
      app_id, ts, method, route_pattern, status_class, count,
      latency_p50_ms, latency_p95_ms, latency_max_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sample.appId,
    ts,
    sample.method,
    sample.routePattern,
    sample.statusClass,
    sample.count,
    sample.latencyP50Ms ?? null,
    sample.latencyP95Ms ?? null,
    sample.latencyMaxMs ?? null,
  );
}

export function writeExitEvent(db: Database.Database, sample: ExitEvent): void {
  const ts = sample.ts && sample.ts > 0 ? Math.floor(sample.ts) : Date.now();
  upsertApp(db, sample.appId, sample.displayName, undefined, ts);
  db.prepare(
    `INSERT INTO events (app_id, ts, kind, exit_code, signal, message, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sample.appId,
    ts,
    sample.exitKind,
    sample.exitCode ?? null,
    sample.signal ?? null,
    sample.message ?? null,
    sample.source ?? 'agent',
  );
}

export function writeHostSample(db: Database.Database, sample: HostSample): void {
  const ts = sample.ts && sample.ts > 0 ? Math.floor(sample.ts) : Date.now();
  db.prepare(
    `INSERT INTO host_raw (ts, load1, load5, load15, mem_used_pct, mem_total_mb, mem_free_mb)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    ts,
    sample.load1 ?? null,
    sample.load5 ?? null,
    sample.load15 ?? null,
    sample.memUsedPct ?? null,
    sample.memTotalMb ?? null,
    sample.memFreeMb ?? null,
  );
}

export function writeIngestSamples(
  db: Database.Database,
  samples: Array<ProcessSample | HttpSample | ExitEvent>,
): number {
  const tx = db.transaction((items: typeof samples) => {
    for (const sample of items) {
      if (sample.kind === 'process') writeProcessSample(db, sample);
      else if (sample.kind === 'http') writeHttpSample(db, sample);
      else writeExitEvent(db, sample);
    }
  });
  tx(samples);
  return samples.length;
}

const RAW_KEEP_MS = 48 * 60 * 60 * 1000;
const ONE_M_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
const ONE_H_KEEP_MS = 90 * 24 * 60 * 60 * 1000;
const EVENTS_KEEP_MS = 90 * 24 * 60 * 60 * 1000;

export function rollupAndPrune(db: Database.Database, now = Date.now()): void {
  const rawCutoff = now - RAW_KEEP_MS;
  const oneMCutoff = now - ONE_M_KEEP_MS;
  const oneHCutoff = now - ONE_H_KEEP_MS;
  const eventsCutoff = now - EVENTS_KEEP_MS;

  db.prepare(
    `INSERT INTO samples_1m (
       app_id, bucket_ts, cpu_avg, cpu_max, rss_avg, rss_max, heap_avg,
       heap_total_avg, heap_external_avg, lag_p95_avg, lag_max, elu_avg, gc_p95_avg, sample_count
     )
     SELECT
       app_id,
       (ts / 60000) * 60000 AS bucket_ts,
       AVG(cpu),
       MAX(cpu),
       AVG(rss_mb),
       MAX(rss_mb),
       AVG(heap_mb),
       AVG(heap_total_mb),
       AVG(heap_external_mb),
       AVG(lag_p95_ms),
       MAX(lag_max_ms),
       AVG(elu),
       AVG(gc_p95_ms),
       COUNT(*)
     FROM samples_raw
     WHERE ts >= ?
     GROUP BY app_id, bucket_ts
     ON CONFLICT(app_id, bucket_ts) DO UPDATE SET
       cpu_avg = excluded.cpu_avg,
       cpu_max = excluded.cpu_max,
       rss_avg = excluded.rss_avg,
       rss_max = excluded.rss_max,
       heap_avg = excluded.heap_avg,
       heap_total_avg = excluded.heap_total_avg,
       heap_external_avg = excluded.heap_external_avg,
       lag_p95_avg = excluded.lag_p95_avg,
       lag_max = excluded.lag_max,
       elu_avg = excluded.elu_avg,
       gc_p95_avg = excluded.gc_p95_avg,
       sample_count = excluded.sample_count`,
  ).run(rawCutoff);

  db.prepare(
    `INSERT INTO samples_1h (
       app_id, bucket_ts, cpu_avg, cpu_max, rss_avg, rss_max, heap_avg,
       heap_total_avg, heap_external_avg, lag_p95_avg, lag_max, elu_avg, gc_p95_avg, sample_count
     )
     SELECT
       app_id,
       (bucket_ts / 3600000) * 3600000 AS bucket_ts,
       AVG(cpu_avg),
       MAX(cpu_max),
       AVG(rss_avg),
       MAX(rss_max),
       AVG(heap_avg),
       AVG(heap_total_avg),
       AVG(heap_external_avg),
       AVG(lag_p95_avg),
       MAX(lag_max),
       AVG(elu_avg),
       AVG(gc_p95_avg),
       SUM(sample_count)
     FROM samples_1m
     WHERE bucket_ts >= ?
     GROUP BY app_id, bucket_ts
     ON CONFLICT(app_id, bucket_ts) DO UPDATE SET
       cpu_avg = excluded.cpu_avg,
       cpu_max = excluded.cpu_max,
       rss_avg = excluded.rss_avg,
       rss_max = excluded.rss_max,
       heap_avg = excluded.heap_avg,
       heap_total_avg = excluded.heap_total_avg,
       heap_external_avg = excluded.heap_external_avg,
       lag_p95_avg = excluded.lag_p95_avg,
       lag_max = excluded.lag_max,
       elu_avg = excluded.elu_avg,
       gc_p95_avg = excluded.gc_p95_avg,
       sample_count = excluded.sample_count`,
  ).run(oneMCutoff);

  db.prepare('DELETE FROM samples_raw WHERE ts < ?').run(rawCutoff);
  db.prepare('DELETE FROM samples_1m WHERE bucket_ts < ?').run(oneMCutoff);
  db.prepare('DELETE FROM samples_1h WHERE bucket_ts < ?').run(oneHCutoff);
  db.prepare('DELETE FROM http_raw WHERE ts < ?').run(rawCutoff);
  db.prepare('DELETE FROM events WHERE ts < ?').run(eventsCutoff);
  db.prepare('DELETE FROM host_raw WHERE ts < ?').run(rawCutoff);
}

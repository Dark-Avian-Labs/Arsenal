import type Database from 'better-sqlite3';

export type FleetAppRow = {
  id: string;
  displayName: string;
  pm2Name: string | null;
  pmxModule: boolean;
  updatedAt: number;
  cpu: number | null;
  rssMb: number | null;
  lagP95Ms: number | null;
  elu: number | null;
  uptimeSec: number | null;
  status: string | null;
  lastGracefulAt: number | null;
  lastCrashAt: number | null;
  crashCount24h: number;
  restartCount24h: number;
  reqPerSec1h: number | null;
  errorRate1h: number | null;
  hours: FleetHour[];
  levelMetric: 'cpu' | 'rss';
};

export type FleetHour = {
  level: number | null;
  bad: boolean;
  errorRate: number | null;
};

const GLANCE_HOURS = 24;
const HOUR_MS = 3_600_000;

const FLEET_SAMPLE_FRESH_MS = 60_000;

type SampleFields = {
  cpu: number | null;
  rssMb: number | null;
  lagP95Ms: number | null;
  elu: number | null;
  uptimeSec: number | null;
  status: string | null;
};

export function coalesceLatestSampleFields(rows: SampleFields[]): SampleFields {
  const out: SampleFields = {
    cpu: null,
    rssMb: null,
    lagP95Ms: null,
    elu: null,
    uptimeSec: null,
    status: null,
  };
  for (const row of rows) {
    if (out.cpu == null && row.cpu != null) out.cpu = row.cpu;
    if (out.rssMb == null && row.rssMb != null) out.rssMb = row.rssMb;
    if (out.lagP95Ms == null && row.lagP95Ms != null) out.lagP95Ms = row.lagP95Ms;
    if (out.elu == null && row.elu != null) out.elu = row.elu;
    if (out.uptimeSec == null && row.uptimeSec != null) out.uptimeSec = row.uptimeSec;
    if (out.status == null && row.status != null) out.status = row.status;
    if (
      out.cpu != null &&
      out.rssMb != null &&
      out.lagP95Ms != null &&
      out.elu != null &&
      out.uptimeSec != null &&
      out.status != null
    ) {
      break;
    }
  }
  return out;
}

export function listFleet(db: Database.Database, now = Date.now()): FleetAppRow[] {
  const since24h = now - 24 * 60 * 60 * 1000;
  const since1h = now - 60 * 60 * 1000;
  const sinceFresh = now - FLEET_SAMPLE_FRESH_MS;
  const apps = db
    .prepare(
      `SELECT id, display_name AS displayName, pm2_name AS pm2Name, pmx_module AS pmxModule, updated_at AS updatedAt
       FROM apps ORDER BY pmx_module, display_name`,
    )
    .all() as Array<{
    id: string;
    displayName: string;
    pm2Name: string | null;
    pmxModule: number;
    updatedAt: number;
  }>;

  const recentSamples = db.prepare(
    `SELECT cpu, rss_mb AS rssMb, lag_p95_ms AS lagP95Ms, elu, uptime_sec AS uptimeSec, status
     FROM samples_raw WHERE app_id = ? AND ts >= ? ORDER BY ts DESC LIMIT 20`,
  );
  const lastEvent = db.prepare(
    `SELECT ts FROM events WHERE app_id = ? AND kind = ? ORDER BY ts DESC LIMIT 1`,
  );
  const countEvents = db.prepare(
    `SELECT COUNT(*) AS c FROM events WHERE app_id = ? AND kind = ? AND ts >= ?`,
  );
  const http1h = db.prepare(
    `SELECT
       COALESCE(SUM(count), 0) AS total,
       COALESCE(SUM(CASE WHEN status_class = '5xx' THEN count ELSE 0 END), 0) AS errors
     FROM http_raw WHERE app_id = ? AND ts >= ?`,
  );
  // Groups the last 24h of samples, http, and events on every poll. Cache this if the fleet poll gets slow.
  const sampleHours = db
    .prepare(
      `SELECT app_id AS appId,
              (CAST(ts AS INTEGER) / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS hour,
              AVG(cpu) AS cpu, AVG(rss_mb) AS rss
       FROM samples_raw WHERE ts >= ? GROUP BY app_id, hour`,
    )
    .all(HOUR_MS, HOUR_MS, since24h) as Array<{
    appId: string;
    hour: number;
    cpu: number | null;
    rss: number | null;
  }>;
  const httpHours = db
    .prepare(
      `SELECT app_id AS appId,
              (CAST(ts AS INTEGER) / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS hour,
              SUM(count) AS total,
              SUM(CASE WHEN status_class = '5xx' THEN count ELSE 0 END) AS errors
       FROM http_raw WHERE ts >= ? GROUP BY app_id, hour`,
    )
    .all(HOUR_MS, HOUR_MS, since24h) as Array<{
    appId: string;
    hour: number;
    total: number;
    errors: number;
  }>;
  const crashHours = db
    .prepare(
      `SELECT app_id AS appId,
              (CAST(ts AS INTEGER) / CAST(? AS INTEGER)) * CAST(? AS INTEGER) AS hour,
              COUNT(*) AS crashes
       FROM events WHERE kind = 'crash' AND ts >= ? GROUP BY app_id, hour`,
    )
    .all(HOUR_MS, HOUR_MS, since24h) as Array<{ appId: string; hour: number; crashes: number }>;

  const sampleByHour = new Map(sampleHours.map((row) => [`${row.appId}:${row.hour}`, row]));
  const httpByHour = new Map(httpHours.map((row) => [`${row.appId}:${row.hour}`, row]));
  const crashByHour = new Map(crashHours.map((row) => [`${row.appId}:${row.hour}`, row.crashes]));
  const endHour = Math.floor(now / HOUR_MS) * HOUR_MS;

  return apps.map((app) => {
    const rows = recentSamples.all(app.id, sinceFresh) as SampleFields[];
    const sample = coalesceLatestSampleFields(rows);
    const lastGraceful = lastEvent.get(app.id, 'graceful') as { ts: number } | undefined;
    const lastCrash = lastEvent.get(app.id, 'crash') as { ts: number } | undefined;
    const crashes = countEvents.get(app.id, 'crash', since24h) as { c: number };
    const restarts = countEvents.get(app.id, 'graceful', since24h) as { c: number };
    const http = http1h.get(app.id, since1h) as { total: number; errors: number };
    const reqPerSec1h = http.total > 0 ? http.total / 3600 : null;
    const errorRate1h = http.total > 0 ? http.errors / http.total : null;
    const useCpu = Array.from({ length: GLANCE_HOURS }, (_, index) => {
      const hour = endHour - (GLANCE_HOURS - 1 - index) * HOUR_MS;
      return sampleByHour.get(`${app.id}:${hour}`)?.cpu ?? null;
    }).some((value) => value != null);
    const hours: FleetHour[] = Array.from({ length: GLANCE_HOURS }, (_, index) => {
      const hour = endHour - (GLANCE_HOURS - 1 - index) * HOUR_MS;
      const key = `${app.id}:${hour}`;
      const sample = sampleByHour.get(key);
      const httpHour = httpByHour.get(key);
      const crashes = crashByHour.get(key) ?? 0;
      return {
        level: useCpu ? (sample?.cpu ?? null) : (sample?.rss ?? null),
        bad: (httpHour?.errors ?? 0) > 0 || crashes > 0,
        errorRate: httpHour && httpHour.total > 0 ? httpHour.errors / httpHour.total : null,
      };
    });
    return {
      id: app.id,
      displayName: app.displayName,
      pm2Name: app.pm2Name,
      pmxModule: app.pmxModule === 1,
      updatedAt: app.updatedAt,
      cpu: sample.cpu,
      rssMb: sample.rssMb,
      lagP95Ms: sample.lagP95Ms,
      elu: sample.elu,
      uptimeSec: sample.uptimeSec,
      status: sample.status,
      lastGracefulAt: lastGraceful?.ts ?? null,
      lastCrashAt: lastCrash?.ts ?? null,
      crashCount24h: crashes.c,
      restartCount24h: restarts.c,
      reqPerSec1h,
      errorRate1h,
      hours,
      levelMetric: useCpu ? 'cpu' : 'rss',
    };
  });
}

export type RangePreset = '1h' | '6h' | '24h' | '7d' | '30d' | 'today';

export function resolveRange(
  preset: RangePreset,
  now = Date.now(),
): { from: number; to: number; table: 'raw' | '1m' | '1h'; bucketMs: number } {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const spans: Record<RangePreset, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    today: now - dayStart.getTime(),
  };
  const span = spans[preset];
  const from = preset === 'today' ? dayStart.getTime() : now - span;
  let table: 'raw' | '1m' | '1h' = 'raw';
  let bucketMs = 60_000;
  if (span > 48 * 60 * 60 * 1000) {
    table = '1h';
    bucketMs = 3_600_000;
  } else if (span > 6 * 60 * 60 * 1000) {
    table = '1m';
    bucketMs = 60_000;
  } else {
    bucketMs = 60_000;
  }
  return { from, to: now, table, bucketMs };
}

export type SeriesPoint = {
  ts: number;
  cpu: number | null;
  rssMb: number | null;
  heapMb: number | null;
  heapTotalMb: number | null;
  heapExternalMb: number | null;
  lagP95Ms: number | null;
  elu: number | null;
  uptimeSec: number | null;
  gcP95Ms: number | null;
};

export function querySeries(
  db: Database.Database,
  appId: string,
  preset: RangePreset,
  now = Date.now(),
): SeriesPoint[] {
  const { from, to, table } = resolveRange(preset, now);
  if (table === 'raw') {
    return db
      .prepare(
        `SELECT ts, cpu, rss_mb AS rssMb, heap_mb AS heapMb, heap_total_mb AS heapTotalMb,
                heap_external_mb AS heapExternalMb, lag_p95_ms AS lagP95Ms, elu,
                uptime_sec AS uptimeSec, gc_p95_ms AS gcP95Ms
         FROM samples_raw WHERE app_id = ? AND ts >= ? AND ts <= ? ORDER BY ts`,
      )
      .all(appId, from, to) as SeriesPoint[];
  }
  if (table === '1m') {
    return db
      .prepare(
        `SELECT bucket_ts AS ts, cpu_avg AS cpu, rss_avg AS rssMb, heap_avg AS heapMb,
                heap_total_avg AS heapTotalMb, heap_external_avg AS heapExternalMb,
                lag_p95_avg AS lagP95Ms, elu_avg AS elu, NULL AS uptimeSec, gc_p95_avg AS gcP95Ms
         FROM samples_1m WHERE app_id = ? AND bucket_ts >= ? AND bucket_ts <= ? ORDER BY bucket_ts`,
      )
      .all(appId, from, to) as SeriesPoint[];
  }
  return db
    .prepare(
      `SELECT bucket_ts AS ts, cpu_avg AS cpu, rss_avg AS rssMb, heap_avg AS heapMb,
              heap_total_avg AS heapTotalMb, heap_external_avg AS heapExternalMb,
              lag_p95_avg AS lagP95Ms, elu_avg AS elu, NULL AS uptimeSec, gc_p95_avg AS gcP95Ms
       FROM samples_1h WHERE app_id = ? AND bucket_ts >= ? AND bucket_ts <= ? ORDER BY bucket_ts`,
    )
    .all(appId, from, to) as SeriesPoint[];
}

export type HttpPoint = {
  ts: number;
  count: number;
  latencyP95Ms: number | null;
  reqPerSec: number | null;
  errorRate: number | null;
};

export function queryHttpSeries(
  db: Database.Database,
  appId: string,
  preset: RangePreset,
  now = Date.now(),
): HttpPoint[] {
  const { from, to, bucketMs } = resolveRange(preset, now);
  const rows = db
    .prepare(
      `SELECT
         (ts / ?) * ? AS ts,
         SUM(count) AS count,
         AVG(latency_p95_ms) AS latencyP95Ms,
         SUM(CASE WHEN status_class = '5xx' THEN count ELSE 0 END) AS errors
       FROM http_raw
       WHERE app_id = ? AND ts >= ? AND ts <= ?
       GROUP BY (ts / ?) * ?
       ORDER BY ts`,
    )
    .all(bucketMs, bucketMs, appId, from, to, bucketMs, bucketMs) as Array<{
    ts: number;
    count: number;
    latencyP95Ms: number | null;
    errors: number;
  }>;

  const bucketSec = bucketMs / 1000;
  return rows.map((row) => ({
    ts: row.ts,
    count: row.count,
    latencyP95Ms: row.latencyP95Ms,
    reqPerSec: bucketSec > 0 ? row.count / bucketSec : null,
    errorRate: row.count > 0 ? row.errors / row.count : null,
  }));
}

export type EventRatePoint = {
  ts: number;
  graceful: number;
  crash: number;
};

export function queryEventRates(
  db: Database.Database,
  appId: string,
  preset: RangePreset,
  now = Date.now(),
): EventRatePoint[] {
  const { from, to, bucketMs } = resolveRange(preset, now);
  return db
    .prepare(
      `SELECT
         (ts / ?) * ? AS ts,
         SUM(CASE WHEN kind = 'graceful' THEN 1 ELSE 0 END) AS graceful,
         SUM(CASE WHEN kind = 'crash' THEN 1 ELSE 0 END) AS crash
       FROM events
       WHERE app_id = ? AND ts >= ? AND ts <= ?
       GROUP BY (ts / ?) * ?
       ORDER BY ts`,
    )
    .all(bucketMs, bucketMs, appId, from, to, bucketMs, bucketMs) as EventRatePoint[];
}

export type EventRow = {
  id: number;
  ts: number;
  kind: string;
  exitCode: number | null;
  signal: string | null;
  message: string | null;
  source: string;
};

export function queryEvents(
  db: Database.Database,
  appId: string,
  preset: RangePreset,
  now = Date.now(),
): EventRow[] {
  const { from, to } = resolveRange(preset, now);
  return db
    .prepare(
      `SELECT id, ts, kind, exit_code AS exitCode, signal, message, source
       FROM events
       WHERE app_id = ? AND ts >= ? AND ts <= ?
       ORDER BY ts DESC
       LIMIT 200`,
    )
    .all(appId, from, to) as EventRow[];
}

export type HostPoint = {
  ts: number;
  load1: number | null;
  load5: number | null;
  memUsedPct: number | null;
};

export function queryHostSeries(
  db: Database.Database,
  preset: RangePreset,
  now = Date.now(),
): HostPoint[] {
  const { from, to } = resolveRange(preset, now);
  return db
    .prepare(
      `SELECT ts, load1, load5, mem_used_pct AS memUsedPct
       FROM host_raw WHERE ts >= ? AND ts <= ? ORDER BY ts`,
    )
    .all(from, to) as HostPoint[];
}

export function getLatestHost(db: Database.Database): HostPoint | null {
  const row = db
    .prepare(
      `SELECT ts, load1, load5, mem_used_pct AS memUsedPct
       FROM host_raw ORDER BY ts DESC LIMIT 1`,
    )
    .get() as HostPoint | undefined;
  return row ?? null;
}

export function getAppMeta(
  db: Database.Database,
  appId: string,
): { id: string; displayName: string; pm2Name: string | null } | null {
  const row = db
    .prepare(`SELECT id, display_name AS displayName, pm2_name AS pm2Name FROM apps WHERE id = ?`)
    .get(appId) as { id: string; displayName: string; pm2Name: string | null } | undefined;
  return row ?? null;
}

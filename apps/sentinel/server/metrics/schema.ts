import type Database from 'better-sqlite3';

function ensureColumn(db: Database.Database, table: string, column: string, typeSql: string): void {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (rows.some((row) => row.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
}

export function migrateMetricsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      pm2_name TEXT,
      pmx_module INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS samples_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      cpu REAL,
      rss_mb REAL,
      heap_mb REAL,
      lag_p50_ms REAL,
      lag_p95_ms REAL,
      lag_max_ms REAL,
      status TEXT,
      FOREIGN KEY (app_id) REFERENCES apps(id)
    );
    CREATE INDEX IF NOT EXISTS idx_samples_raw_app_ts ON samples_raw(app_id, ts);

    CREATE TABLE IF NOT EXISTS samples_1m (
      app_id TEXT NOT NULL,
      bucket_ts INTEGER NOT NULL,
      cpu_avg REAL,
      cpu_max REAL,
      rss_avg REAL,
      rss_max REAL,
      heap_avg REAL,
      lag_p95_avg REAL,
      lag_max REAL,
      sample_count INTEGER NOT NULL,
      PRIMARY KEY (app_id, bucket_ts)
    );

    CREATE TABLE IF NOT EXISTS samples_1h (
      app_id TEXT NOT NULL,
      bucket_ts INTEGER NOT NULL,
      cpu_avg REAL,
      cpu_max REAL,
      rss_avg REAL,
      rss_max REAL,
      heap_avg REAL,
      lag_p95_avg REAL,
      lag_max REAL,
      sample_count INTEGER NOT NULL,
      PRIMARY KEY (app_id, bucket_ts)
    );

    CREATE TABLE IF NOT EXISTS http_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      method TEXT NOT NULL,
      route_pattern TEXT NOT NULL,
      status_class TEXT NOT NULL,
      count INTEGER NOT NULL,
      latency_p50_ms REAL,
      latency_p95_ms REAL,
      latency_max_ms REAL,
      FOREIGN KEY (app_id) REFERENCES apps(id)
    );
    CREATE INDEX IF NOT EXISTS idx_http_raw_app_ts ON http_raw(app_id, ts);

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      kind TEXT NOT NULL,
      exit_code INTEGER,
      signal TEXT,
      message TEXT,
      source TEXT NOT NULL,
      FOREIGN KEY (app_id) REFERENCES apps(id)
    );
    CREATE INDEX IF NOT EXISTS idx_events_app_ts ON events(app_id, ts);

    CREATE TABLE IF NOT EXISTS host_raw (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      load1 REAL,
      load5 REAL,
      load15 REAL,
      mem_used_pct REAL,
      mem_total_mb REAL,
      mem_free_mb REAL
    );
    CREATE INDEX IF NOT EXISTS idx_host_raw_ts ON host_raw(ts);
  `);

  ensureColumn(db, 'apps', 'pmx_module', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn(db, 'samples_raw', 'heap_total_mb', 'REAL');
  ensureColumn(db, 'samples_raw', 'heap_external_mb', 'REAL');
  ensureColumn(db, 'samples_raw', 'elu', 'REAL');
  ensureColumn(db, 'samples_raw', 'uptime_sec', 'REAL');
  ensureColumn(db, 'samples_raw', 'gc_p95_ms', 'REAL');

  ensureColumn(db, 'samples_1m', 'heap_total_avg', 'REAL');
  ensureColumn(db, 'samples_1m', 'heap_external_avg', 'REAL');
  ensureColumn(db, 'samples_1m', 'elu_avg', 'REAL');
  ensureColumn(db, 'samples_1m', 'gc_p95_avg', 'REAL');

  ensureColumn(db, 'samples_1h', 'heap_total_avg', 'REAL');
  ensureColumn(db, 'samples_1h', 'heap_external_avg', 'REAL');
  ensureColumn(db, 'samples_1h', 'elu_avg', 'REAL');
  ensureColumn(db, 'samples_1h', 'gc_p95_avg', 'REAL');
}

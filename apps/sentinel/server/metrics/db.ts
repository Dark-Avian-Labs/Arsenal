import Database from 'better-sqlite3';

import { METRICS_DB_PATH, NODE_ENV } from '../config.ts';
import { migrateMetricsSchema } from './schema.ts';

let metricsDb: Database.Database | null = null;

export function getMetricsDb(): Database.Database {
  if (!metricsDb) {
    const path = NODE_ENV === 'test' ? ':memory:' : METRICS_DB_PATH;
    metricsDb = new Database(path);
    metricsDb.pragma('journal_mode = WAL');
    metricsDb.pragma('foreign_keys = ON');
    metricsDb.pragma('busy_timeout = 5000');
    migrateMetricsSchema(metricsDb);
  }
  return metricsDb;
}

export function closeMetricsDb(): void {
  if (metricsDb) {
    metricsDb.close();
    metricsDb = null;
  }
}

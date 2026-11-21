import { createDbSingleton } from '@dark-avian-labs/server-kit';

import { METRICS_DB_PATH, NODE_ENV } from '../config.ts';
import { migrateMetricsSchema } from './schema.ts';

const dbPath = NODE_ENV === 'test' ? ':memory:' : METRICS_DB_PATH;
const { getDb: getMetricsDb, closeDb: closeMetricsDb } = createDbSingleton(dbPath, {
  onOpen: (db) => migrateMetricsSchema(db),
});

export { getMetricsDb, closeMetricsDb };

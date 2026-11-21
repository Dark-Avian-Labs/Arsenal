import { createDbSingleton } from '@dark-avian-labs/server-kit';

import { ACTIONS_DB_PATH, NODE_ENV } from '../config.ts';
import { migrateActionsSchema } from './schema.ts';

const dbPath = NODE_ENV === 'test' ? ':memory:' : ACTIONS_DB_PATH;
const { getDb: getActionsDb, closeDb: closeActionsDb } = createDbSingleton(dbPath, {
  onOpen: (db) => migrateActionsSchema(db),
});

export { getActionsDb, closeActionsDb };

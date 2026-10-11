import Database from 'better-sqlite3';

import { ACTIONS_DB_PATH, NODE_ENV } from '../config.ts';
import { migrateActionsSchema } from './schema.ts';

let actionsDb: Database.Database | null = null;

export function getActionsDb(): Database.Database {
  if (!actionsDb) {
    const path = NODE_ENV === 'test' ? ':memory:' : ACTIONS_DB_PATH;
    actionsDb = new Database(path);
    actionsDb.pragma('journal_mode = WAL');
    actionsDb.pragma('foreign_keys = ON');
    actionsDb.pragma('busy_timeout = 5000');
    migrateActionsSchema(actionsDb);
  }
  return actionsDb;
}

export function closeActionsDb(): void {
  if (actionsDb) {
    actionsDb.close();
    actionsDb = null;
  }
}

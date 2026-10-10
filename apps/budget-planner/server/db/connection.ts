import Database from 'better-sqlite3';

import { APP_DB_PATH } from '../config.ts';

let appDb: Database.Database | null = null;

function openDb(filePath: string): Database.Database {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  return db;
}

export function getAppDb(): Database.Database {
  if (!appDb) {
    appDb = openDb(APP_DB_PATH);
  }
  return appDb;
}

export function closeAppDb(): void {
  if (appDb) {
    appDb.close();
    appDb = null;
  }
}

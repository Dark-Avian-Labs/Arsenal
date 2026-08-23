import Database from 'better-sqlite3';

import { SESSION_DB_PATH } from '../config.js';

let sessionDb: Database.Database | null = null;

export function getSessionDb(): Database.Database {
  if (!sessionDb) {
    sessionDb = new Database(SESSION_DB_PATH);
    sessionDb.pragma('journal_mode = WAL');
    sessionDb.pragma('foreign_keys = ON');
    // Wait for locks instead of failing instantly with SQLITE_BUSY when a
    // second process (backup tooling, CLI inspection) touches the file.
    sessionDb.pragma('busy_timeout = 5000');
  }
  return sessionDb;
}

export function closeSessionDb(): void {
  if (sessionDb) {
    sessionDb.close();
    sessionDb = null;
  }
}

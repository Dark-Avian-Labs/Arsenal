import Database from 'better-sqlite3';

import { CENTRAL_DB_PATH } from '../config.js';

let centralDb: Database.Database | null = null;

export function getCentralDb(): Database.Database {
  if (!centralDb) {
    centralDb = new Database(CENTRAL_DB_PATH);
    centralDb.pragma('journal_mode = WAL');
    centralDb.pragma('foreign_keys = ON');
  }
  return centralDb;
}

export function closeAll(): void {
  if (centralDb) {
    centralDb.close();
    centralDb = null;
  }
}

process.on('SIGINT', () => {
  closeAll();
  process.exit(0); // eslint-disable-line n/no-process-exit
});
process.on('SIGTERM', () => {
  closeAll();
  process.exit(0); // eslint-disable-line n/no-process-exit
});

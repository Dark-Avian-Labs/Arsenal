import { SqliteDatabase } from '@dark-avian-labs/server-kit';

import { WARFRAME_CATALOG_DB_PATH } from '../../../config.ts';

let catalogDb: SqliteDatabase | null = null;

function openDatabase(filePath: string): SqliteDatabase {
  const db = new SqliteDatabase(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

export function getCatalogDb(): SqliteDatabase {
  if (!catalogDb) {
    catalogDb = openDatabase(WARFRAME_CATALOG_DB_PATH);
  }
  return catalogDb;
}

export function closeCatalogDb(): void {
  if (catalogDb) {
    catalogDb.close();
    catalogDb = null;
  }
}

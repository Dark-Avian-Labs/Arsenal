import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { DEFAULT_SQLITE_PRAGMAS } from './sqlitePragmas.ts';

export interface DbSingletonOptions {
  pragmas?: string[];
  onOpen?: (db: Database.Database) => void;
}

export interface DbSingleton {
  getDb(): Database.Database;
  closeDb(): void;
}

export function openSqlite(
  dbPath: string,
  pragmas: readonly string[] = DEFAULT_SQLITE_PRAGMAS,
): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  for (const pragma of pragmas) {
    db.pragma(pragma);
  }
  return db;
}

export function createDbSingleton(dbPath: string, options?: DbSingletonOptions): DbSingleton {
  let instance: Database.Database | null = null;

  function getDb(): Database.Database {
    if (instance) return instance;
    const db = openSqlite(dbPath, [...DEFAULT_SQLITE_PRAGMAS, ...(options?.pragmas ?? [])]);
    const originalClose = db.close.bind(db);
    db.close = ((...args: Parameters<typeof originalClose>) => {
      const result = originalClose(...args);
      instance = null;
      return result;
    }) as typeof db.close;
    try {
      options?.onOpen?.(db);
    } catch (err) {
      db.close();
      throw err;
    }
    instance = db;
    return db;
  }

  function closeDb(): void {
    if (instance) {
      instance.close();
    }
  }

  return { getDb, closeDb };
}

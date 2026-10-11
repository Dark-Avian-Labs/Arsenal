import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { resetCatalogData, USER_TABLE_NAMES } from './resetCatalogData.ts';

describe('resetCatalogData', () => {
  let db: Database.Database | null = null;

  afterEach(() => {
    db?.close();
    db = null;
  });

  it('clears catalog tables but refuses when user tables have rows', () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE warframes (unique_name TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO warframes VALUES ('/Lotus/Test', 'Test');
      CREATE TABLE builds (id INTEGER PRIMARY KEY, clerk_user_id TEXT NOT NULL, name TEXT NOT NULL);
      INSERT INTO builds (clerk_user_id, name) VALUES ('user_1', 'My Build');
    `);

    expect(() => resetCatalogData(db!)).toThrow(/Refusing catalog reset/);

    db.exec('DELETE FROM builds');
    const cleared = resetCatalogData(db!);
    expect(cleared.warframes).toBe(1);
    expect((db.prepare('SELECT COUNT(*) AS c FROM warframes').get() as { c: number }).c).toBe(0);
  });

  it('keeps the import lease and run history', () => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE warframes (unique_name TEXT PRIMARY KEY, name TEXT NOT NULL);
      INSERT INTO warframes VALUES ('/Lotus/Test', 'Test');
      CREATE TABLE import_lease (
        id INTEGER PRIMARY KEY,
        lock_token TEXT,
        run_id INTEGER,
        acquired_at TEXT
      );
      INSERT INTO import_lease VALUES (1, 'held-token', 4, '2026-10-11');
      CREATE TABLE import_runs (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL
      );
      INSERT INTO import_runs VALUES (4, 'running');
    `);

    const cleared = resetCatalogData(db!);
    expect(cleared.import_lease).toBeUndefined();
    expect(cleared.import_runs).toBeUndefined();
    expect(
      (db.prepare('SELECT lock_token FROM import_lease WHERE id = 1').get() as { lock_token: string }).lock_token,
    ).toBe('held-token');
    expect((db.prepare('SELECT COUNT(*) AS c FROM import_runs').get() as { c: number }).c).toBe(1);
  });

  it('documents user table guard list', () => {
    expect(USER_TABLE_NAMES).toContain('builds');
    expect(USER_TABLE_NAMES).toContain('loadouts');
  });
});

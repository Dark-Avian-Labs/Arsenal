import { describe, expect, it } from 'vitest';

import { getUserVersion, runUserVersionMigrations } from './migrations.ts';
import { openMemorySqlite, type SqliteDatabase } from './sqlite.ts';

describe('runUserVersionMigrations', () => {
  it('applies each migration once in version order and advances user_version', () => {
    const db = openMemorySqlite();
    const ran: string[] = [];
    const migrations = [
      {
        version: 2,
        name: 'add-email',
        up: (conn: SqliteDatabase) => {
          ran.push('v2');
          conn.exec('ALTER TABLE items ADD COLUMN email TEXT');
        },
      },
      {
        version: 1,
        name: 'create-items',
        up: (conn: SqliteDatabase) => {
          ran.push('v1');
          conn.exec('CREATE TABLE items (id INTEGER PRIMARY KEY)');
        },
      },
    ];

    expect(getUserVersion(db)).toBe(0);
    expect(runUserVersionMigrations(db, migrations)).toBe(2);
    expect(ran).toEqual(['v1', 'v2']);
    expect(getUserVersion(db)).toBe(2);

    // Second run is a no-op
    expect(runUserVersionMigrations(db, migrations)).toBe(2);
    expect(ran).toEqual(['v1', 'v2']);
    db.close();
  });

  it('rejects duplicate or non-positive migration versions before applying any migration', () => {
    const db = openMemorySqlite();
    const ran: string[] = [];
    expect(() =>
      runUserVersionMigrations(db, [
        { version: 1, name: 'first', up: () => ran.push('first') },
        { version: 1, name: 'duplicate', up: () => ran.push('duplicate') },
      ]),
    ).toThrow(/Duplicate migration version 1/);
    expect(() => runUserVersionMigrations(db, [{ version: 0, name: 'zero', up: () => ran.push('zero') }])).toThrow(
      /Invalid migration version/,
    );
    expect(ran).toEqual([]);
    expect(getUserVersion(db)).toBe(0);
    db.close();
  });

  it('rolls back failed migrations and restores PRAGMA foreign_keys even when foreignKeysOff throws', () => {
    const db = openMemorySqlite();
    try {
      db.pragma('foreign_keys = ON');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

      expect(() =>
        runUserVersionMigrations(db, [
          {
            version: 1,
            name: 'boom-fk-off',
            foreignKeysOff: true,
            up: (conn: SqliteDatabase) => {
              expect(conn.pragma('foreign_keys', { simple: true })).toBe(0);
              conn.exec('CREATE TABLE should_rollback (id INTEGER PRIMARY KEY)');
              throw new Error('migration exploded');
            },
          },
        ]),
      ).toThrow('migration exploded');

      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(getUserVersion(db)).toBe(0);
      const table = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'should_rollback'")
        .get();
      expect(table).toBeUndefined();
    } finally {
      db.close();
    }
  });
});

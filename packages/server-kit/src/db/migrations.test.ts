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

  it('rejects duplicate migration versions before applying any migration', () => {
    const db = openMemorySqlite();
    const ran: string[] = [];
    const migrations = [
      { version: 1, name: 'first', up: () => ran.push('first') },
      { version: 1, name: 'duplicate', up: () => ran.push('duplicate') },
    ];

    expect(() => runUserVersionMigrations(db, migrations)).toThrow(/Duplicate migration version 1/);
    expect(ran).toEqual([]);
    expect(getUserVersion(db)).toBe(0);
    db.close();
  });
});

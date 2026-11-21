import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { getUserVersion, runUserVersionMigrations } from './migrations.ts';

describe('runUserVersionMigrations', () => {
  it('applies each migration once in version order and advances user_version', () => {
    const db = new Database(':memory:');
    const ran: string[] = [];
    const migrations = [
      {
        version: 2,
        name: 'add-email',
        up: (conn: Database.Database) => {
          ran.push('v2');
          conn.exec('ALTER TABLE items ADD COLUMN email TEXT');
        },
      },
      {
        version: 1,
        name: 'create-items',
        up: (conn: Database.Database) => {
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
});

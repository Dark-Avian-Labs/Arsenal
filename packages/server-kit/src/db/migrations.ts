export interface UserVersionMigratableDb {
  pragma(source: string, options?: { simple?: boolean }): unknown;
  transaction<F extends () => void>(fn: F): () => void;
}

export interface SchemaMigration<Db extends UserVersionMigratableDb = UserVersionMigratableDb> {
  version: number;
  name: string;
  /** Disable foreign_keys around the transaction when a migration must rebuild a referenced table. */
  foreignKeysOff?: boolean;
  up: (db: Db) => void;
}

export function getUserVersion(db: UserVersionMigratableDb): number {
  const value = db.pragma('user_version', { simple: true });
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

export function runUserVersionMigrations<Db extends UserVersionMigratableDb>(
  db: Db,
  migrations: readonly SchemaMigration<Db>[],
): number {
  const seen = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Invalid migration version ${migration.version} (${migration.name})`);
    }
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version ${migration.version} (${migration.name})`);
    }
    seen.add(migration.version);
  }

  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  let current = getUserVersion(db);

  for (const migration of ordered) {
    if (migration.version <= current) continue;
    const apply = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    if (migration.foreignKeysOff) {
      db.pragma('foreign_keys = OFF');
      try {
        apply();
      } finally {
        db.pragma('foreign_keys = ON');
      }
    } else {
      apply();
    }
    current = migration.version;
  }

  return current;
}

export interface UserVersionMigratableDb {
  pragma(source: string, options?: { simple?: boolean }): unknown;
  transaction<F extends () => void>(fn: F): () => void;
}

export interface SchemaMigration<Db extends UserVersionMigratableDb = UserVersionMigratableDb> {
  version: number;
  name: string;
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
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  let current = getUserVersion(db);

  for (const migration of ordered) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new Error(`Invalid migration version ${migration.version} (${migration.name})`);
    }
    if (migration.version <= current) continue;
    const apply = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
    current = migration.version;
  }

  return current;
}

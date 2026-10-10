import Database from 'better-sqlite3';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createSchema as createWorSchema } from '../../games/wor/db/schema.ts';
import { ensureWorImportTables } from '../../games/wor/db/schema.ts';
import {
  requireWorImportLease,
  tryAcquireWorImportLease,
  WorImportLeaseLostError,
} from './importLease.ts';
import { applyWorCatalogMutation } from './startupPipeline.ts';
import { describeWithSqlite } from '../../testing/describeWithSqlite.ts';
import { createTempDbDir, removeTempDbDir } from '../../testing/sqliteTestHarness.ts';

describeWithSqlite('WoR import lease writes', () => {
  let db: Database.Database;
  let tmpDir: string;

  beforeEach(() => {
    const paths = createTempDbDir('wor-import-lease-');
    tmpDir = paths.tmpDir;
    db = new Database(paths.dbPath);
    createWorSchema(db);
    ensureWorImportTables(db);
  });

  afterEach(() => {
    db.close();
    removeTempDbDir(tmpDir);
  });

  it('does not mutate catalog after the lease token is replaced', () => {
    const token = tryAcquireWorImportLease(db, null);
    expect(token).toBeTruthy();
    const watch = { lost: false };

    requireWorImportLease(db, token!, watch);
    applyWorCatalogMutation(db, db, {
      heroes: [{ slug: 'lian', name: 'Lian', class: 'marksman', faction: 'watchguard', rarity: 'legendary' }],
      artifacts: [],
      demons: [],
    });

    db.prepare('UPDATE import_lease SET lock_token = ? WHERE id = 1').run('stolen');
    expect(() => {
      requireWorImportLease(db, token!, watch);
      applyWorCatalogMutation(db, db, {
        heroes: [{ slug: 'hex', name: 'Hex', class: 'fighter', faction: 'chaos_dominion', rarity: 'legendary' }],
        artifacts: [],
        demons: [],
      });
    }).toThrow(WorImportLeaseLostError);

    const slugs = db.prepare('SELECT slug FROM catalog_heroes ORDER BY slug').all() as Array<{ slug: string }>;
    expect(slugs.map((row) => row.slug)).toEqual(['lian']);
  });
});

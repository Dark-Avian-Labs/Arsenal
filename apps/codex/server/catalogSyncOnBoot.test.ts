import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const pathsState = vi.hoisted(() => ({
  worCatalogPath: '',
  warframeCatalogPath: '',
  worCatalogDb: null as SqliteDatabase | null,
  worAppDb: null as SqliteDatabase | null,
}));

vi.mock('./config.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./config.ts')>();
  return {
    ...actual,
    get WOR_CATALOG_DB_PATH() {
      return pathsState.worCatalogPath;
    },
    get WARFRAME_CATALOG_DB_PATH() {
      return pathsState.warframeCatalogPath;
    },
  };
});

vi.mock('./games/wor/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./games/wor/index.ts')>();
  return {
    ...actual,
    getWorCatalogDb: () => pathsState.worCatalogDb!,
    getWorDb: () => pathsState.worAppDb!,
  };
});

import { syncCatalogSnapshotsToCollectionsOnBoot } from './catalogSyncOnBoot.ts';
import { createSchema as createWorSchema } from './games/wor/db/schema.ts';
import { worQueries } from './games/wor/index.ts';
import { describeWithSqlite } from './testing/describeWithSqlite.ts';

describeWithSqlite('syncCatalogSnapshotsToCollectionsOnBoot', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-boot-sync-'));
    pathsState.worCatalogPath = path.join(tmpDir, 'wor-catalog.db');
    pathsState.warframeCatalogPath = path.join(tmpDir, 'missing-wf-catalog.db');

    pathsState.worCatalogDb = new SqliteDatabase(pathsState.worCatalogPath);
    createWorSchema(pathsState.worCatalogDb);
    pathsState.worAppDb = new SqliteDatabase(path.join(tmpDir, 'wor-collection.db'));
    createWorSchema(pathsState.worAppDb);
  });

  afterEach(() => {
    pathsState.worCatalogDb?.close();
    pathsState.worAppDb?.close();
    pathsState.worCatalogDb = null;
    pathsState.worAppDb = null;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('refreshes WoR collection from an updated catalog snapshot while preserving user ownership', () => {
    const catalogDb = pathsState.worCatalogDb!;
    const appDb = pathsState.worAppDb!;

    // Seed an existing hero + user account + owned hero row in collection DB.
    appDb
      .prepare(
        `INSERT INTO catalog_heroes (slug, name, class, faction, rarity, star_rating, is_lord, is_regular, is_ancient, is_limited, display_order, active)
         VALUES ('silas', 'Silas', 'marksman', 'piercers', 'legendary', 5, 0, 1, 0, 0, 1, 1)`,
      )
      .run();
    const accountId = worQueries.createGameAccount(appDb, 'user_1', 'Main', true);
    appDb
      .prepare(
        `UPDATE account_heroes SET owned = 1, gauge_level = 3
         WHERE account_id = ? AND catalog_hero_slug = 'silas'`,
      )
      .run(accountId);

    // Populate catalog snapshot with Silas (updated) + new hero Hex at a newer version.
    catalogDb
      .prepare(
        `INSERT INTO catalog_heroes (slug, name, class, faction, rarity, star_rating, is_lord, is_regular, is_ancient, is_limited, display_order, active)
         VALUES
           ('silas', 'Silas', 'marksman', 'piercers', 'legendary', 5, 0, 1, 0, 0, 1, 1),
           ('hex', 'Hex', 'marksman', 'infernal', 'legendary', 5, 0, 1, 0, 0, 2, 1)`,
      )
      .run();
    catalogDb.prepare('UPDATE catalog_meta SET catalog_version = 2 WHERE id = 1').run();

    syncCatalogSnapshotsToCollectionsOnBoot();

    expect(worQueries.getCatalogVersion(appDb)).toBe(2);
    const accountHeroes = appDb
      .prepare(
        'SELECT catalog_hero_slug, owned, gauge_level FROM account_heroes WHERE account_id = ? ORDER BY catalog_hero_slug',
      )
      .all(accountId) as Array<{ catalog_hero_slug: string; owned: number; gauge_level: number }>;

    expect(accountHeroes).toEqual([
      { catalog_hero_slug: 'hex', owned: 0, gauge_level: 0 },
      { catalog_hero_slug: 'silas', owned: 1, gauge_level: 3 },
    ]);
  });
});

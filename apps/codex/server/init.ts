import { log } from '@dark-avian-labs/server-kit';

import { syncCatalogSnapshotsToCollectionsOnBoot } from './catalogSyncOnBoot.ts';
import { ensureDataDirs, NODE_ENV } from './config.ts';
import { refreshEpic7DbAvailability } from './epic7DbState.ts';
import { closeEpic7Db, getEpic7Db } from './games/epic7/index.ts';
import { closeWarframeDb, getWarframeDb } from './games/warframe/index.ts';
import { closeWorCatalogDb, closeWorDb, getWorDb } from './games/wor/index.ts';
import {
  ensureWarframeSyncJobsSchema,
  failStaleWarframeSyncRuns,
} from './services/warframeSyncJobs.ts';
import { waitForWarframeSyncIdle } from './services/warframeSyncState.ts';
import { refreshWorDbAvailability } from './worDbState.ts';

function assertTableExists(db: { prepare: (sql: string) => unknown }, tableName: string): void {
  const row = (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") as {
      get: (param: string) => unknown;
    }
  ).get(tableName);
  if (!row) {
    throw new Error(`Required table "${tableName}" was not found.`);
  }
}

export function ensureGameSchemasReady(): void {
  const warframeDb = getWarframeDb();
  const epic7Db = getEpic7Db();
  assertTableExists(warframeDb, 'worksheets');
  assertTableExists(warframeDb, 'columns');
  assertTableExists(warframeDb, 'rows');
  assertTableExists(warframeDb, 'cell_values');

  assertTableExists(epic7Db, 'game_accounts');
  assertTableExists(epic7Db, 'base_heroes');
  assertTableExists(epic7Db, 'base_artifacts');
  assertTableExists(epic7Db, 'account_heroes');
  assertTableExists(epic7Db, 'account_artifacts');

  const worDb = getWorDb();
  assertTableExists(worDb, 'game_accounts');
  assertTableExists(worDb, 'catalog_heroes');
  assertTableExists(worDb, 'catalog_artifacts');
  assertTableExists(worDb, 'catalog_demons');
  assertTableExists(worDb, 'account_heroes');
  assertTableExists(worDb, 'account_artifacts');
  assertTableExists(worDb, 'account_demons');
}

export function initCodex(options?: { syncSnapshots?: boolean }): Promise<void> {
  ensureDataDirs();
  ensureWarframeSyncJobsSchema();
  failStaleWarframeSyncRuns();
  ensureGameSchemasReady();

  const shouldSyncSnapshots =
    options?.syncSnapshots ?? process.env.CODEX_AUTO_SCRAPE_ON_BOOT !== '1';
  if (shouldSyncSnapshots && NODE_ENV !== 'test') {
    syncCatalogSnapshotsToCollectionsOnBoot();
  }

  return Promise.all([refreshEpic7DbAvailability(), refreshWorDbAvailability()]).then(() => {});
}

export async function beforeCloseCodex(shutdownTimeoutMs: number): Promise<void> {
  const timeoutMs = Math.max(shutdownTimeoutMs - 2000, 1000);
  const syncFinished = await waitForWarframeSyncIdle(timeoutMs);
  if (!syncFinished) {
    log('warn', 'Warframe sync still running; proceeding with shutdown');
  }
}

export function closeCodex(): void {
  closeWarframeDb();
  closeEpic7Db();
  closeWorDb();
  closeWorCatalogDb();
}

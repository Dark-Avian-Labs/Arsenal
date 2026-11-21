import fs from 'node:fs';

import { log } from '@dark-avian-labs/server-kit';

import { stopModListCacheCleanup } from './cache/modListCache.ts';
import { ARMORY_DB_PATH, CODEX_WARFRAME_CATALOG_DB_PATH, ensureDataDirs } from './config.ts';
import { closeAll } from './db/connection.ts';
import { repairPlaceholderArtifactSlots } from './db/repairArtifactSlots.ts';
import { createAppSchema } from './db/schema.ts';
import {
  isAdminCatalogSyncRunning,
  waitForAdminCatalogSyncIdle,
} from './import/adminCatalogSyncJob.ts';
import {
  catalogWarframeCount,
  codexCatalogDbExists,
  syncCodexWarframeCatalog,
} from './import/codexCatalog.ts';

function isCodexCatalogNewerThanArmory(): boolean {
  if (!fs.existsSync(CODEX_WARFRAME_CATALOG_DB_PATH) || !fs.existsSync(ARMORY_DB_PATH)) {
    return false;
  }
  const srcStat = fs.statSync(CODEX_WARFRAME_CATALOG_DB_PATH);
  if (srcStat.size === 0) return false;
  const dstStat = fs.statSync(ARMORY_DB_PATH);
  return srcStat.mtimeMs > dstStat.mtimeMs;
}

export function initArmory(): void {
  ensureDataDirs();
  createAppSchema();
  repairPlaceholderArtifactSlots();

  try {
    if (
      codexCatalogDbExists() &&
      (catalogWarframeCount() === 0 || isCodexCatalogNewerThanArmory())
    ) {
      const summary = syncCodexWarframeCatalog({
        onLog: (message, level = 'info') => {
          log(level === 'error' ? 'error' : 'info', message, { source: 'catalogSync' });
        },
      });
      log('info', 'Boot-synced Codex Warframe catalog into Armory', {
        source: CODEX_WARFRAME_CATALOG_DB_PATH,
        tables: summary.tables,
        imagesCopied: summary.imagesCopied,
      });
    }
  } catch (error) {
    log('warn', 'Codex catalog sync skipped on boot', {
      error: error instanceof Error ? error.message : String(error),
      source: CODEX_WARFRAME_CATALOG_DB_PATH,
    });
  }
}

export async function beforeCloseArmory(shutdownTimeoutMs: number): Promise<void> {
  if (!isAdminCatalogSyncRunning()) return;
  log('info', 'Waiting for admin catalog sync before shutdown');
  const syncWaitMs = Math.max(shutdownTimeoutMs - 2000, 1000);
  const finished = await waitForAdminCatalogSyncIdle(syncWaitMs);
  if (!finished) {
    log('warn', 'Admin catalog sync still running; proceeding with shutdown');
  }
}

export function closeArmory(): void {
  stopModListCacheCleanup();
  closeAll();
}

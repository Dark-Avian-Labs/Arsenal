import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { log } from '@dark-avian-labs/server-kit';

import { stopModListCacheCleanup } from './cache/modListCache.ts';
import { CODEX_WARFRAME_CATALOG_DB_PATH, ensureDataDirs } from './config.ts';
import { closeAll, getCatalogDb } from './db/connection.ts';
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

function ensureCatalogSyncStateTable(): void {
  getCatalogDb().exec(`
    CREATE TABLE IF NOT EXISTS armory_catalog_sync_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      source_sha256 TEXT NOT NULL,
      synced_at TEXT NOT NULL
    )
  `);
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function getLastSyncedSourceSha256(): string | null {
  ensureCatalogSyncStateTable();
  const row = getCatalogDb()
    .prepare('SELECT source_sha256 FROM armory_catalog_sync_state WHERE id = 1')
    .get() as { source_sha256?: string } | undefined;
  return row?.source_sha256 ?? null;
}

function recordSyncedSourceSha256(sourceSha256: string): void {
  ensureCatalogSyncStateTable();
  getCatalogDb()
    .prepare(
      `INSERT INTO armory_catalog_sync_state (id, source_sha256, synced_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         source_sha256 = excluded.source_sha256,
         synced_at = excluded.synced_at`,
    )
    .run(sourceSha256);
}

export function initArmory(): void {
  ensureDataDirs();
  createAppSchema();
  repairPlaceholderArtifactSlots();

  try {
    if (codexCatalogDbExists()) {
      const sourceSha256 = sha256File(CODEX_WARFRAME_CATALOG_DB_PATH);
      const lastSyncedSha256 = getLastSyncedSourceSha256();
      if (catalogWarframeCount() === 0 || sourceSha256 !== lastSyncedSha256) {
        const summary = syncCodexWarframeCatalog({
          onLog: (message, level = 'info') => {
            log(level === 'error' ? 'error' : 'info', message, { source: 'catalogSync' });
          },
        });
        recordSyncedSourceSha256(sourceSha256);
        log('info', 'Boot-synced Codex Warframe catalog into Armory', {
          source: CODEX_WARFRAME_CATALOG_DB_PATH,
          tables: summary.tables,
          imagesCopied: summary.imagesCopied,
        });
      }
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

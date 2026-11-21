import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { log } from '@dark-avian-labs/server-kit';
import type { SqliteDatabase } from '@dark-avian-labs/server-kit';

import { CODEX_WOR_DB_PATH, ensureDataDirs } from './config.ts';
import { closeAppDb, getAppDb } from './db/appDb.ts';
import { catalogArtifactCount, catalogHeroCount } from './db/queries.ts';
import { importCodexCatalog } from './import/codexCatalog.ts';

function ensureCatalogSyncStateTable(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS outfitter_catalog_sync_state (
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

function getLastSyncedSourceSha256(db: SqliteDatabase): string | null {
  ensureCatalogSyncStateTable(db);
  const row = db
    .prepare('SELECT source_sha256 FROM outfitter_catalog_sync_state WHERE id = 1')
    .get() as { source_sha256?: string } | undefined;
  return row?.source_sha256 ?? null;
}

function recordSyncedSourceSha256(db: SqliteDatabase, sourceSha256: string): void {
  ensureCatalogSyncStateTable(db);
  db.prepare(
    `INSERT INTO outfitter_catalog_sync_state (id, source_sha256, synced_at)
     VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       source_sha256 = excluded.source_sha256,
       synced_at = excluded.synced_at`,
  ).run(sourceSha256);
}

export function initOutfitter(): void {
  ensureDataDirs();
  try {
    const db = getAppDb();
    const hasCodexDb = fs.existsSync(CODEX_WOR_DB_PATH) && fs.statSync(CODEX_WOR_DB_PATH).size > 0;
    if (!hasCodexDb) return;

    const sourceSha256 = sha256File(CODEX_WOR_DB_PATH);
    const lastSyncedSha256 = getLastSyncedSourceSha256(db);
    if (
      catalogHeroCount(db) === 0 ||
      catalogArtifactCount(db) === 0 ||
      sourceSha256 !== lastSyncedSha256
    ) {
      const summary = importCodexCatalog();
      recordSyncedSourceSha256(db, sourceSha256);
      log('info', 'Imported Codex WoR catalog', summary);
    }
  } catch (error) {
    log('warn', 'Codex catalog import skipped', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function closeOutfitter(): void {
  closeAppDb();
}

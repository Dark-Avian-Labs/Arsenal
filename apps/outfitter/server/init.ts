import fs from 'node:fs';

import { log } from '@dark-avian-labs/server-kit';

import { APP_DB_PATH, CODEX_WOR_DB_PATH, ensureDataDirs } from './config.ts';
import { closeAppDb, getAppDb } from './db/appDb.ts';
import { catalogArtifactCount, catalogHeroCount } from './db/queries.ts';
import { importCodexCatalog } from './import/codexCatalog.ts';

function isCodexWorCatalogNewer(): boolean {
  if (!fs.existsSync(CODEX_WOR_DB_PATH) || !fs.existsSync(APP_DB_PATH)) {
    return false;
  }
  const srcStat = fs.statSync(CODEX_WOR_DB_PATH);
  if (srcStat.size === 0) return false;
  const dstStat = fs.statSync(APP_DB_PATH);
  return srcStat.mtimeMs > dstStat.mtimeMs;
}

export function initOutfitter(): void {
  ensureDataDirs();
  try {
    const db = getAppDb();
    if (catalogHeroCount(db) === 0 || catalogArtifactCount(db) === 0 || isCodexWorCatalogNewer()) {
      const summary = importCodexCatalog();
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

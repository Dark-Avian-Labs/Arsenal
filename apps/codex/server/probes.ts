import fs from 'node:fs';

import Database from 'better-sqlite3';
import type { Request, Response } from 'express';

import { APP_NAME, WARFRAME_CATALOG_DB_PATH, WOR_CATALOG_DB_PATH } from './config.js';
import { getSessionDb } from './db/sessionDb.js';
import { isEpic7DbAvailable, refreshEpic7DbAvailability } from './epic7DbState.js';
import { getEpic7Db } from './games/epic7/index.js';
import { getWarframeDb } from './games/warframe/index.js';
import { getWorDb } from './games/wor/index.js';
import { isWorDbAvailable, refreshWorDbAvailability } from './worDbState.js';

export function healthzHandler(_req: Request, res: Response): void {
  res.json({ status: 'ok', app: APP_NAME });
}

function assertCatalogTablesReadable(dbPath: string, requiredTables: string[]): void {
  if (!dbPath.trim()) return;
  fs.accessSync(dbPath, fs.constants.R_OK);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 1000');
    for (const table of requiredTables) {
      const row = db
        .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
        .get(table) as { ok: number } | undefined;
      if (!row) {
        throw new Error(`Catalog DB missing required table ${table}: ${dbPath}`);
      }
    }
  } finally {
    db.close();
  }
}

export async function assertCodexReady(): Promise<void> {
  getSessionDb().prepare('SELECT 1').get();
  getWarframeDb().prepare('SELECT 1').get();
  await refreshEpic7DbAvailability();
  if (!isEpic7DbAvailable()) {
    throw new Error('Epic7 database unavailable');
  }
  getEpic7Db().prepare('SELECT 1').get();
  await refreshWorDbAvailability();
  if (!isWorDbAvailable()) {
    throw new Error('WoR database unavailable');
  }
  getWorDb().prepare('SELECT 1').get();
  assertCatalogTablesReadable(WARFRAME_CATALOG_DB_PATH, ['warframes', 'weapons', 'mods']);
  assertCatalogTablesReadable(WOR_CATALOG_DB_PATH, [
    'catalog_heroes',
    'catalog_artifacts',
    'catalog_demons',
    'catalog_meta',
  ]);
}

export async function readyzHandler(_req: Request, res: Response): Promise<void> {
  try {
    await assertCodexReady();
    res.json({ status: 'ready', app: APP_NAME });
  } catch {
    res.status(503).json({ status: 'not_ready', app: APP_NAME });
  }
}

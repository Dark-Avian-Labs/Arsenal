import fs from 'node:fs';
import path from 'node:path';

import {
  loadAppEnv,
  readPackageVersion,
  readReleaseVersion,
  readServerEnv,
  resolveProjectRoot,
} from '@dark-avian-labs/server-kit';

export const PROJECT_ROOT = resolveProjectRoot(import.meta.url);
loadAppEnv(PROJECT_ROOT, { requireClerkKeys: false });

export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));
export const DATA_DIR = path.resolve(
  process.env.ARSENAL_DATA_DIR?.trim() || path.join(PROJECT_ROOT, 'data'),
);

const serverEnv = readServerEnv({ port: 3000, appName: 'Arsenal', appId: 'arsenal' });
export const PORT = serverEnv.PORT;
export const HOST = serverEnv.HOST;
export const NODE_ENV = serverEnv.NODE_ENV;
export const SHUTDOWN_TIMEOUT_MS = serverEnv.SHUTDOWN_TIMEOUT_MS;
export const APP_NAME = serverEnv.APP_NAME;
export const APP_ID = serverEnv.APP_ID;
export const TRUST_PROXY = serverEnv.TRUST_PROXY;
export const CLERK_WEBHOOK_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim() || '';

export interface UnifiedDataPaths {
  warframeDb: string;
  warframeCatalogDb: string;
  epic7Db: string;
  worDb: string;
  worCatalogDb: string;
  armoryUserDb: string;
  outfitterDb: string;
  budgetDb: string;
  warframeImagesDir: string;
  worImagesDir: string;
}

export function resolveUnifiedDataPaths(baseDataDir = DATA_DIR): UnifiedDataPaths {
  return {
    warframeDb: process.env.WARFRAME_DB_PATH?.trim() || path.join(baseDataDir, 'warframe.db'),
    warframeCatalogDb:
      process.env.WARFRAME_CATALOG_DB_PATH?.trim() || path.join(baseDataDir, 'warframe-catalog.db'),
    epic7Db: process.env.EPIC7_DB_PATH?.trim() || path.join(baseDataDir, 'epic7.db'),
    worDb: process.env.WOR_DB_PATH?.trim() || path.join(baseDataDir, 'wor.db'),
    worCatalogDb:
      process.env.WOR_CATALOG_DB_PATH?.trim() || path.join(baseDataDir, 'wor-catalog.db'),
    armoryUserDb: process.env.USER_DB_PATH?.trim() || path.join(baseDataDir, 'builds.db'),
    outfitterDb: process.env.OUTFITTER_DB_PATH?.trim() || path.join(baseDataDir, 'outfitter.db'),
    budgetDb: process.env.BUDGET_DB_PATH?.trim() || path.join(baseDataDir, 'budget.db'),
    warframeImagesDir:
      process.env.WARFRAME_IMAGES_DIR?.trim() || path.join(baseDataDir, 'images', 'warframe'),
    worImagesDir: process.env.WOR_IMAGES_DIR?.trim() || path.join(baseDataDir, 'images', 'wor'),
  };
}

/**
 * Configure shared process.env paths BEFORE dynamically importing sub-apps so Codex, Armory,
 * Outfitter, and BudgetPlanner all share the unified data directory and immutable catalogs
 * directly in-process without disk-copying bridges or conflicting APP_DB_PATH values.
 */
export function applyUnifiedSubAppEnv(baseDataDir = DATA_DIR): UnifiedDataPaths {
  const paths = resolveUnifiedDataPaths(baseDataDir);
  fs.mkdirSync(baseDataDir, { recursive: true });
  fs.mkdirSync(paths.warframeImagesDir, { recursive: true });
  fs.mkdirSync(paths.worImagesDir, { recursive: true });

  process.env.ARSENAL_SKIP_LOAD_ENV = '1';
  process.env.WARFRAME_DB_PATH = paths.warframeDb;
  process.env.WARFRAME_CATALOG_DB_PATH = paths.warframeCatalogDb;
  process.env.EPIC7_DB_PATH = paths.epic7Db;
  process.env.WOR_DB_PATH = paths.worDb;
  process.env.WOR_CATALOG_DB_PATH = paths.worCatalogDb;
  process.env.WARFRAME_IMAGES_DIR = paths.warframeImagesDir;
  process.env.WOR_IMAGES_DIR = paths.worImagesDir;

  // Armory reads Codex's immutable Warframe catalog and images directly.
  process.env.ARMORY_DB_PATH = paths.warframeCatalogDb;
  process.env.USER_DB_PATH = paths.armoryUserDb;
  process.env.ARMORY_IMAGES_DIR = paths.warframeImagesDir;
  process.env.CODEX_WARFRAME_CATALOG_DB_PATH = paths.warframeCatalogDb;
  process.env.CODEX_WARFRAME_IMAGES_DIR = paths.warframeImagesDir;

  // Outfitter reads Codex's immutable WoR catalog and portraits directly.
  process.env.OUTFITTER_DB_PATH = paths.outfitterDb;
  process.env.HERO_IMAGES_DIR = paths.worImagesDir;
  process.env.CODEX_WOR_DB_PATH = paths.worCatalogDb;
  process.env.CODEX_WOR_IMAGES_DIR = paths.worImagesDir;

  // BudgetPlanner gets its own dedicated DB path.
  process.env.BUDGET_DB_PATH = paths.budgetDb;
  return paths;
}

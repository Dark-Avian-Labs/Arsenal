import fs from 'fs';
import path from 'path';

import {
  loadAppEnv,
  readPackageVersion,
  readReleaseVersion,
  readServerEnv,
  resolveProjectRoot,
} from '@dark-avian-labs/server-kit';

export const PROJECT_ROOT = resolveProjectRoot(import.meta.url);
loadAppEnv(PROJECT_ROOT);

export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));

export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
export const IMAGES_DIR = path.join(DATA_DIR, 'images');

function resolveProjectPath(configured: string | undefined, fallbackRelative: string): string {
  const value = configured?.trim();
  if (value) {
    return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
  }
  return path.resolve(PROJECT_ROOT, fallbackRelative);
}

export const ARMORY_DB_PATH = resolveProjectPath(
  process.env.ARMORY_DB_PATH,
  path.join('data', 'armory.db'),
);

export const USER_DB_PATH = resolveProjectPath(
  process.env.USER_DB_PATH,
  path.join('data', 'builds.db'),
);

export const CODEX_WARFRAME_CATALOG_DB_PATH = resolveProjectPath(
  process.env.CODEX_WARFRAME_CATALOG_DB_PATH,
  path.join('..', 'codex', 'data', 'warframe-catalog.db'),
);

export const CODEX_WARFRAME_IMAGES_DIR = resolveProjectPath(
  process.env.CODEX_WARFRAME_IMAGES_DIR,
  path.join('..', 'codex', 'data', 'warframe-images'),
);

const serverEnv = readServerEnv({ port: 3002, appName: 'Armory', appId: 'armory' });
export const PORT = serverEnv.PORT;
export const SHUTDOWN_TIMEOUT_MS = serverEnv.SHUTDOWN_TIMEOUT_MS;
export const HOST = serverEnv.HOST;
export const NODE_ENV = serverEnv.NODE_ENV;

if (NODE_ENV === 'production' && !path.isAbsolute(USER_DB_PATH)) {
  throw new Error('[FATAL] USER_DB_PATH must be an absolute path in production.');
}

export const APP_NAME = serverEnv.APP_NAME;
export const APP_ID = serverEnv.APP_ID;

export const MANIFEST_URL = 'https://origin.warframe.com/PublicExport/index_en.txt.lzma';
export const CONTENT_BASE_URL = 'https://content.warframe.com/PublicExport/Manifest/';
export const IMAGE_BASE_URL = 'https://content.warframe.com/PublicExport';

export const REQUIRED_EXPORTS = [
  'ExportCustoms',
  'ExportDrones',
  'ExportFlavour',
  'ExportFusionBundles',
  'ExportGear',
  'ExportKeys',
  'ExportManifest',
  'ExportRecipes',
  'ExportRegions',
  'ExportRelicArcane',
  'ExportResources',
  'ExportSentinels',
  'ExportSortieRewards',
  'ExportUpgrades',
  'ExportWarframes',
  'ExportWeapons',
] as const;

export const TRUST_PROXY = serverEnv.TRUST_PROXY;
export const SECURE_COOKIES = serverEnv.SECURE_COOKIES;
export const LEGAL_PAGE_URL = serverEnv.LEGAL_PAGE_URL;
export const CLERK_WEBHOOK_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim() || '';
if (NODE_ENV === 'production' && !CLERK_WEBHOOK_SIGNING_SECRET) {
  throw new Error('[FATAL] CLERK_WEBHOOK_SIGNING_SECRET must be set in production.');
}
export { GAME_ID } from './gameId.ts';

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, EXPORTS_DIR, IMAGES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  fs.mkdirSync(path.dirname(USER_DB_PATH), { recursive: true });
}

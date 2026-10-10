import fs from 'fs';
import path from 'path';

import {
  loadAppEnv,
  parseBooleanEnv,
  parseIntEnv,
  readPackageVersion,
  readReleaseVersion,
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
  path.join('..', 'Codex', 'data', 'warframe-catalog.db'),
);

export const CODEX_WARFRAME_IMAGES_DIR = resolveProjectPath(
  process.env.CODEX_WARFRAME_IMAGES_DIR,
  path.join('..', 'Codex', 'data', 'warframe-images'),
);

export const PORT = parseIntEnv(process.env.PORT, 3002);
export const SHUTDOWN_TIMEOUT_MS = parseIntEnv(process.env.SHUTDOWN_TIMEOUT_MS, 10_000);
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production' && !path.isAbsolute(USER_DB_PATH)) {
  throw new Error('[FATAL] USER_DB_PATH must be an absolute path in production.');
}

export const APP_NAME = 'Armory';
export const APP_ID = 'armory';

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

export const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY) ?? false;
export const SECURE_COOKIES =
  parseBooleanEnv(process.env.SECURE_COOKIES) ?? NODE_ENV === 'production';
export const LEGAL_PAGE_URL =
  process.env.LEGAL_PAGE_URL?.trim() ||
  process.env.VITE_LEGAL_PAGE_URL?.trim() ||
  'https://darkavianlabs.com/legal';
export const CLERK_WEBHOOK_SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim() || '';
if (NODE_ENV === 'production' && !CLERK_WEBHOOK_SIGNING_SECRET) {
  throw new Error('[FATAL] CLERK_WEBHOOK_SIGNING_SECRET must be set in production.');
}
export { GAME_ID } from './gameId.js';

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, EXPORTS_DIR, IMAGES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
  fs.mkdirSync(path.dirname(USER_DB_PATH), { recursive: true });
}

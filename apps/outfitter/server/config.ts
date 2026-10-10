import fs from 'fs';
import path from 'path';

import {
  isEncryptedEnvValue,
  loadAppEnv,
  readPackageVersion,
  readReleaseVersion,
  readServerEnv,
  resolveProjectRoot,
} from '@dark-avian-labs/server-kit';

export const PROJECT_ROOT = resolveProjectRoot(import.meta.url);
loadAppEnv(PROJECT_ROOT);
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

const rawAppId = process.env.APP_ID?.trim() || '';
if (isEncryptedEnvValue(rawAppId)) {
  throw new Error(
    '[FATAL] APP_ID is still encrypted. Ensure DOTENV_PRIVATE_KEY_* is available (see .env.keys) or run via dotenvx.',
  );
}

const serverEnv = readServerEnv({ port: 3004, appName: 'Outfitter', appId: 'outfitter' });
export const PORT = serverEnv.PORT;
export const SHUTDOWN_TIMEOUT_MS = serverEnv.SHUTDOWN_TIMEOUT_MS;
export const HOST = serverEnv.HOST;
export const NODE_ENV = serverEnv.NODE_ENV;
export const APP_NAME = serverEnv.APP_NAME;
export const APP_ID = serverEnv.APP_ID;
export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));
export const TRUST_PROXY = serverEnv.TRUST_PROXY;
export const SECURE_COOKIES = serverEnv.SECURE_COOKIES;
export const APP_PUBLIC_BASE_URL = serverEnv.APP_PUBLIC_BASE_URL;
export const LEGAL_PAGE_URL = serverEnv.LEGAL_PAGE_URL;

function resolveProjectPath(configured: string | undefined, fallbackRelative: string): string {
  const value = configured?.trim();
  if (value) {
    return path.isAbsolute(value) ? value : path.resolve(PROJECT_ROOT, value);
  }
  return path.resolve(PROJECT_ROOT, fallbackRelative);
}

export const APP_DB_PATH = resolveProjectPath(
  process.env.APP_DB_PATH,
  path.join('data', 'outfitter.db'),
);
export const HERO_IMAGES_DIR = resolveProjectPath(
  process.env.HERO_IMAGES_DIR,
  path.join('data', 'hero-images'),
);
export const CODEX_WOR_DB_PATH = resolveProjectPath(
  process.env.CODEX_WOR_DB_PATH,
  path.join('..', 'codex', 'data', 'wor-catalog.db'),
);
export const CODEX_WOR_IMAGES_DIR = resolveProjectPath(
  process.env.CODEX_WOR_IMAGES_DIR,
  path.join('..', 'codex', 'data', 'wor-images'),
);

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, path.dirname(APP_DB_PATH), HERO_IMAGES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

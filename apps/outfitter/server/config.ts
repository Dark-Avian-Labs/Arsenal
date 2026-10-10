import fs from 'fs';
import path from 'path';

import {
  isEncryptedEnvValue,
  loadAppEnv,
  parseBooleanEnv,
  parseIntEnv,
  readPackageVersion,
  readReleaseVersion,
  resolveProjectRoot,
} from '@dark-avian-labs/server-kit';

export const PROJECT_ROOT = resolveProjectRoot(import.meta.url);
loadAppEnv(PROJECT_ROOT);
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

export const PORT = parseIntEnv(process.env.PORT, 3004);
export const SHUTDOWN_TIMEOUT_MS = parseIntEnv(process.env.SHUTDOWN_TIMEOUT_MS, 10_000);
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const APP_NAME = process.env.APP_NAME?.trim() || 'Outfitter';
const rawAppId = process.env.APP_ID?.trim() || '';
if (isEncryptedEnvValue(rawAppId)) {
  throw new Error(
    '[FATAL] APP_ID is still encrypted. Ensure DOTENV_PRIVATE_KEY_* is available (see .env.keys) or run via dotenvx.',
  );
}
export const APP_ID = rawAppId || 'outfitter';
export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));

export const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY) ?? false;
export const SECURE_COOKIES =
  parseBooleanEnv(process.env.SECURE_COOKIES) ?? NODE_ENV === 'production';
export const APP_PUBLIC_BASE_URL = process.env.APP_PUBLIC_BASE_URL?.trim() || '';
export const LEGAL_PAGE_URL =
  process.env.LEGAL_PAGE_URL?.trim() ||
  process.env.VITE_LEGAL_PAGE_URL?.trim() ||
  'https://darkavianlabs.com/legal';

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
  path.join('..', 'Codex', 'data', 'wor-catalog.db'),
);
export const CODEX_WOR_IMAGES_DIR = resolveProjectPath(
  process.env.CODEX_WOR_IMAGES_DIR,
  path.join('..', 'Codex', 'data', 'wor-images'),
);

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, path.dirname(APP_DB_PATH), HERO_IMAGES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

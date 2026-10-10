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

function resolveSessionDbPath(): string {
  const configured = process.env.SESSION_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
  }
  return path.join(DATA_DIR, 'sessions.db');
}

export const SESSION_DB_PATH = resolveSessionDbPath();

export const PORT = parseIntEnv(process.env.PORT, 3000);
export const SHUTDOWN_TIMEOUT_MS = parseIntEnv(process.env.SHUTDOWN_TIMEOUT_MS, 10_000);
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const APP_NAME = process.env.APP_NAME?.trim() || 'AppBase';
export const APP_ID = process.env.APP_ID?.trim() || 'appbase';

export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));

const DEFAULT_SESSION_SECRET = 'appbase-dev-only-secret-change-me-32ch';
const envSessionSecret = process.env.SESSION_SECRET?.trim() || '';
if (isEncryptedEnvValue(envSessionSecret)) {
  throw new Error(
    '[FATAL] SESSION_SECRET is still encrypted. Ensure DOTENV_PRIVATE_KEY_* is available (see .env.keys) or run via dotenvx.',
  );
}
if (NODE_ENV === 'production' && envSessionSecret.length < 32) {
  throw new Error('[FATAL] SESSION_SECRET must be set and at least 32 characters in production.');
}
export const SESSION_SECRET = envSessionSecret || DEFAULT_SESSION_SECRET;

export const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY) ?? false;
export const SECURE_COOKIES =
  parseBooleanEnv(process.env.SECURE_COOKIES) ?? NODE_ENV === 'production';
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN?.trim() || undefined;
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim() || `${APP_ID}.sid`;
export const APP_PUBLIC_BASE_URL = process.env.APP_PUBLIC_BASE_URL?.trim() || '';
export const LEGAL_PAGE_URL =
  process.env.LEGAL_PAGE_URL?.trim() ||
  process.env.VITE_LEGAL_PAGE_URL?.trim() ||
  'https://darkavianlabs.com/legal';

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, path.dirname(SESSION_DB_PATH)]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

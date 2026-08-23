import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { config as loadEnv } from '@dotenvx/dotenvx';

import { normalizeClerkEnv } from './clerkEnv.js';

function resolveEnvFilePath(projectRoot: string): string | null {
  const normalizedNodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();

  if (normalizedNodeEnv === 'test') {
    const testPath = path.join(projectRoot, '.env.test');
    return fs.existsSync(testPath) ? testPath : null;
  }

  const envFileByMode: Record<string, string> = {
    production: '.env.production',
    development: '.env.development',
  };
  const prioritizedFiles = [
    envFileByMode[normalizedNodeEnv],
    '.env.production',
    '.env.development',
  ].filter((value, index, values): value is string => {
    return typeof value === 'string' && values.indexOf(value) === index;
  });

  for (const fileName of prioritizedFiles) {
    const candidatePath = path.join(projectRoot, fileName);
    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }
  return null;
}

const projectRoot = process.cwd();
const envKeysPath = path.join(projectRoot, '.env.keys');
if (fs.existsSync(envKeysPath)) {
  try {
    loadEnv({ path: envKeysPath, quiet: true });
  } catch (error) {
    console.error(`[Config] Failed to load environment keys from "${envKeysPath}".`, error);
    throw error;
  }
}

const envFilePath = resolveEnvFilePath(projectRoot);
if (envFilePath) {
  try {
    loadEnv({ path: envFilePath, quiet: true });
  } catch (error) {
    console.error(`[Config] Failed to load environment from "${envFilePath}".`, error);
    throw error;
  }
}

normalizeClerkEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parentName = path.basename(path.resolve(__dirname, '..'));
export const PROJECT_ROOT = path.resolve(__dirname, parentName === 'dist' ? '../..' : '..');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

function resolveSessionDbPath(): string {
  const configured = process.env.SESSION_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
  }
  return path.join(DATA_DIR, 'sessions.db');
}

export const SESSION_DB_PATH = resolveSessionDbPath();

const _port = parseInt(process.env.PORT || '3000', 10);
export const PORT = Number.isFinite(_port) && _port > 0 ? _port : 3000;
const _shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);
export const SHUTDOWN_TIMEOUT_MS =
  Number.isFinite(_shutdownTimeoutMs) && _shutdownTimeoutMs > 0 ? _shutdownTimeoutMs : 10_000;
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const APP_NAME = process.env.APP_NAME?.trim() || 'AppBase';
export const APP_ID = process.env.APP_ID?.trim() || 'appbase';

const DEFAULT_SESSION_SECRET = 'appbase-dev-only-secret-change-me-32ch';
const envSessionSecret = process.env.SESSION_SECRET?.trim() || '';
if (NODE_ENV === 'production' && envSessionSecret.length < 32) {
  throw new Error('[FATAL] SESSION_SECRET must be set and at least 32 characters in production.');
}
export const SESSION_SECRET = envSessionSecret || DEFAULT_SESSION_SECRET;

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

export const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY) ?? false;
export const SECURE_COOKIES =
  parseBooleanEnv(process.env.SECURE_COOKIES) ?? NODE_ENV === 'production';
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN?.trim() || undefined;
export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME?.trim() || `${APP_ID}.sid`;
export const APP_PUBLIC_BASE_URL = process.env.APP_PUBLIC_BASE_URL?.trim() || '';

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, path.dirname(SESSION_DB_PATH)]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

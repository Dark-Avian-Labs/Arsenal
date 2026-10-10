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
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');

function resolveMetricsDbPath(): string {
  const configured = process.env.METRICS_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
  }
  return path.join(DATA_DIR, 'metrics.db');
}

export const METRICS_DB_PATH = resolveMetricsDbPath();
export const SENTINEL_INGEST_TOKEN = process.env.SENTINEL_INGEST_TOKEN?.trim() || '';

export const PORT = parseIntEnv(process.env.PORT, 3005);
export const SHUTDOWN_TIMEOUT_MS = parseIntEnv(process.env.SHUTDOWN_TIMEOUT_MS, 10_000);
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const APP_NAME = process.env.APP_NAME?.trim() || 'Sentinel';
export const APP_ID = process.env.APP_ID?.trim() || 'sentinel';
export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));

export const TRUST_PROXY = parseBooleanEnv(process.env.TRUST_PROXY) ?? false;
export const SECURE_COOKIES =
  parseBooleanEnv(process.env.SECURE_COOKIES) ?? NODE_ENV === 'production';
export const APP_PUBLIC_BASE_URL = process.env.APP_PUBLIC_BASE_URL?.trim() || '';
export const LEGAL_PAGE_URL =
  process.env.LEGAL_PAGE_URL?.trim() ||
  process.env.VITE_LEGAL_PAGE_URL?.trim() ||
  'https://darkavianlabs.com/legal';

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, path.dirname(METRICS_DB_PATH)]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

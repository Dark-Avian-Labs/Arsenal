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

const serverEnv = readServerEnv({ port: 3005, appName: 'Sentinel', appId: 'sentinel' });
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

export function ensureDataDirs(): void {
  for (const dir of [DATA_DIR, path.dirname(METRICS_DB_PATH)]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

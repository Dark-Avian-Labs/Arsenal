import fs from 'fs';
import path from 'path';

import {
  isClerkConfigured,
  isEncryptedEnvValue,
  loadAppEnv,
  parseIntEnv,
  readPackageVersion,
  readReleaseVersion,
  resolveProjectRoot,
} from '@dark-avian-labs/server-kit';

export const PROJECT_ROOT = resolveProjectRoot(import.meta.url);
loadAppEnv(PROJECT_ROOT, { overload: true, requireClerkKeys: false });

function assertNotEncrypted(name: string, value: string): void {
  if (isEncryptedEnvValue(value)) {
    throw new Error(
      `[FATAL] ${name} is still encrypted. Ensure .env.keys / DOTENV_PRIVATE_KEY_* is available.`,
    );
  }
}

export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const APP_DB_PATH = process.env.APP_DB_PATH || path.join(DATA_DIR, 'app.db');

export const PORT = parseIntEnv(process.env.PORT, 3003);
export const HOST = process.env.HOST || '127.0.0.1';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const SHUTDOWN_TIMEOUT_MS = parseIntEnv(process.env.SHUTDOWN_TIMEOUT_MS, 10_000);

export const APP_NAME = process.env.APP_NAME?.trim() || 'BudgetPlanner';
export const APP_ID = process.env.APP_ID?.trim() || 'budgetplanner';

export const TRUST_PROXY = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
export const SECURE_COOKIES =
  process.env.SECURE_COOKIES === '1' || process.env.SECURE_COOKIES === 'true';
const clerkPublishable =
  process.env.CLERK_PUBLISHABLE_KEY?.trim() || process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() || '';
const clerkSecret = process.env.CLERK_SECRET_KEY?.trim() || '';

if (NODE_ENV === 'production') {
  assertNotEncrypted('CLERK_PUBLISHABLE_KEY', clerkPublishable);
  assertNotEncrypted('CLERK_SECRET_KEY', clerkSecret);
}

export const CLERK_PUBLISHABLE_KEY = clerkPublishable;
export const CLERK_SECRET_KEY = clerkSecret;
export const CLERK_CONFIGURED = isClerkConfigured();

export const LEGAL_PAGE_URL =
  process.env.LEGAL_PAGE_URL?.trim() ||
  process.env.VITE_LEGAL_PAGE_URL?.trim() ||
  'https://darkavianlabs.com/legal';

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(APP_DB_PATH)), { recursive: true });
}

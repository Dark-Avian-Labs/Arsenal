import fs from 'fs';
import path from 'path';

import {
  isClerkConfigured,
  isEncryptedEnvValue,
  loadAppEnv,
  readPackageVersion,
  readReleaseVersion,
  readServerEnv,
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

const serverEnv = readServerEnv({ port: 3003, appName: 'BudgetPlanner', appId: 'budgetplanner' });
export const PORT = serverEnv.PORT;
export const HOST = serverEnv.HOST;
export const NODE_ENV = serverEnv.NODE_ENV;
export const SHUTDOWN_TIMEOUT_MS = serverEnv.SHUTDOWN_TIMEOUT_MS;
export const APP_NAME = serverEnv.APP_NAME;
export const APP_ID = serverEnv.APP_ID;
export const TRUST_PROXY = serverEnv.TRUST_PROXY;
export const SECURE_COOKIES = serverEnv.SECURE_COOKIES;
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

export const LEGAL_PAGE_URL = serverEnv.LEGAL_PAGE_URL;

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(path.resolve(APP_DB_PATH)), { recursive: true });
}

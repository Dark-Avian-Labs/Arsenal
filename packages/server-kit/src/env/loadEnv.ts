import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenvx from '@dotenvx/dotenvx';

import { normalizeClerkEnv } from './clerkEnv.ts';

const { config: loadEnvFile } = dotenvx;

export function resolveProjectRoot(importMetaUrl: string): string {
  const dir = path.dirname(fileURLToPath(importMetaUrl));
  const parentName = path.basename(path.resolve(dir, '..'));
  return path.resolve(dir, parentName === 'dist' ? '../..' : '..');
}

function resolveEnvFilePath(projectRoot: string): string | null {
  const normalizedNodeEnv = (process.env.NODE_ENV ?? '').trim().toLowerCase();

  if (normalizedNodeEnv === 'test') {
    const testPath = path.join(projectRoot, '.env.test');
    return fs.existsSync(testPath) ? testPath : null;
  }

  if (
    normalizedNodeEnv &&
    normalizedNodeEnv !== 'production' &&
    normalizedNodeEnv !== 'development'
  ) {
    throw new Error(
      `[FATAL] Unsupported NODE_ENV "${process.env.NODE_ENV}". Use production, development, or test.`,
    );
  }

  const isProduction = normalizedNodeEnv === 'production';
  const fileName = isProduction ? '.env.production' : '.env.development';
  const candidatePath = path.join(projectRoot, fileName);
  if (fs.existsSync(candidatePath)) {
    return candidatePath;
  }
  if (isProduction) {
    throw new Error(
      `[FATAL] Missing ${fileName}. Refusing to start production without the matching env file.`,
    );
  }
  return null;
}

export function loadAppEnv(
  projectRoot: string,
  options?: { overload?: boolean; requireClerkKeys?: boolean },
): void {
  const envKeysPath = path.join(projectRoot, '.env.keys');
  if (fs.existsSync(envKeysPath)) {
    try {
      loadEnvFile({ path: envKeysPath, quiet: true });
    } catch (error) {
      console.error(`[Config] Failed to load environment keys from "${envKeysPath}".`, error);
      throw error;
    }
  }

  const envFilePath = resolveEnvFilePath(projectRoot);
  if (envFilePath) {
    try {
      loadEnvFile({
        path: envFilePath,
        quiet: true,
        ...(options?.overload ? { overload: true } : {}),
      });
    } catch (error) {
      console.error(`[Config] Failed to load environment from "${envFilePath}".`, error);
      throw error;
    }
  } else {
    console.debug(
      `[Config] No env file resolved (envFilePath is null); skipping loadEnv for cwd "${projectRoot}".`,
    );
  }

  normalizeClerkEnv(options?.requireClerkKeys === false ? { requireKeys: false } : undefined);
}

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

export function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readPackageVersion(projectRoot: string): string {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
    const pkg: unknown = JSON.parse(raw);
    if (!pkg || typeof pkg !== 'object' || !('version' in pkg)) return '0.0.0';
    const version = pkg.version;
    if (typeof version !== 'string') return '0.0.0';
    const trimmed = version.trim();
    return trimmed.length > 0 ? trimmed : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface ServerEnvOptions {
  port: number;
  appName: string;
  appId: string;
}

export interface ServerEnv {
  PORT: number;
  SHUTDOWN_TIMEOUT_MS: number;
  HOST: string;
  NODE_ENV: string;
  APP_NAME: string;
  APP_ID: string;
  TRUST_PROXY: boolean;
  SECURE_COOKIES: boolean;
  APP_PUBLIC_BASE_URL: string;
  LEGAL_PAGE_URL: string;
}

export function readServerEnv(options: ServerEnvOptions): ServerEnv {
  const nodeEnv = process.env.NODE_ENV?.trim() || 'development';
  return {
    PORT: parseIntEnv(process.env.PORT, options.port),
    SHUTDOWN_TIMEOUT_MS: parseIntEnv(process.env.SHUTDOWN_TIMEOUT_MS, 10_000),
    HOST: process.env.HOST?.trim() || '127.0.0.1',
    NODE_ENV: nodeEnv,
    APP_NAME: process.env.APP_NAME?.trim() || options.appName,
    APP_ID: process.env.APP_ID?.trim() || options.appId,
    TRUST_PROXY: parseBooleanEnv(process.env.TRUST_PROXY) ?? false,
    SECURE_COOKIES: parseBooleanEnv(process.env.SECURE_COOKIES) ?? nodeEnv === 'production',
    APP_PUBLIC_BASE_URL: process.env.APP_PUBLIC_BASE_URL?.trim() || '',
    LEGAL_PAGE_URL:
      process.env.LEGAL_PAGE_URL?.trim() ||
      process.env.VITE_LEGAL_PAGE_URL?.trim() ||
      'https://darkavianlabs.com/legal',
  };
}

export function readReleaseVersion(projectRoot: string, fallback = '0.0.0-dev'): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(path.join(projectRoot, 'release.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim()) return parsed.version.trim();
  } catch {}
  return fallback;
}

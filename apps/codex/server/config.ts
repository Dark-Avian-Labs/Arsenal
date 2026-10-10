import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  getAppPublicBaseUrl,
  normalizeClerkEnv,
  requireAbsoluteSqlitePath,
} from '@dark-avian-labs/server-kit';
import dotenvx from '@dotenvx/dotenvx';

import { resolveEnvFilePath } from './core.ts';

const { config: loadEnv } = dotenvx;

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

const envPath = resolveEnvFilePath(projectRoot);
if (envPath) {
  try {
    loadEnv({ path: envPath, quiet: true });
  } catch (error) {
    console.error(`[Config] Failed to load environment via loadEnv from "${envPath}".`, error);
    throw error;
  }
} else {
  console.debug(
    `[Config] No env file resolved (envPath is null); skipping loadEnv for cwd "${projectRoot}".`,
  );
}

normalizeClerkEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const parentName = path.basename(path.resolve(__dirname, '..'));
export const PROJECT_ROOT = path.resolve(__dirname, parentName === 'dist' ? '../..' : '..');

function readPackageVersion(projectRoot: string): string {
  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw) as { version?: string };
    const v = pkg.version?.trim();
    return v && v.length > 0 ? v : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const APP_VERSION = readPackageVersion(PROJECT_ROOT);

export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
process.env.DATA_DIR = DATA_DIR;

function resolveGameDbEnvPath(
  envKey:
    | 'WARFRAME_DB_PATH'
    | 'EPIC7_DB_PATH'
    | 'WOR_DB_PATH'
    | 'WOR_CATALOG_DB_PATH'
    | 'WARFRAME_CATALOG_DB_PATH',
  defaultFilename: string,
): string {
  const raw = process.env[envKey]?.trim();
  const resolved = raw
    ? path.isAbsolute(raw)
      ? raw
      : path.resolve(PROJECT_ROOT, raw)
    : path.join(DATA_DIR, defaultFilename);
  const validated = requireAbsoluteSqlitePath(envKey, resolved);
  process.env[envKey] = validated;
  return validated;
}

export const WARFRAME_DB_PATH = resolveGameDbEnvPath('WARFRAME_DB_PATH', 'warframe.db');
export const WARFRAME_CATALOG_DB_PATH = resolveGameDbEnvPath(
  'WARFRAME_CATALOG_DB_PATH',
  'warframe-catalog.db',
);
export const EPIC7_DB_PATH = resolveGameDbEnvPath('EPIC7_DB_PATH', 'epic7.db');
export const WOR_DB_PATH = resolveGameDbEnvPath('WOR_DB_PATH', 'wor.db');
export const WOR_CATALOG_DB_PATH = resolveGameDbEnvPath('WOR_CATALOG_DB_PATH', 'wor-catalog.db');

function resolveImagesDirUnderData(
  envKey: 'WOR_IMAGES_DIR' | 'WARFRAME_IMAGES_DIR',
  defaultDirName: string,
): string {
  const raw = process.env[envKey]?.trim();
  const resolved = raw
    ? path.isAbsolute(raw)
      ? raw
      : path.resolve(PROJECT_ROOT, raw)
    : path.join(DATA_DIR, defaultDirName);
  const dataDirResolved = path.resolve(DATA_DIR);
  const relative = path.relative(dataDirResolved, path.resolve(resolved));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${envKey} must resolve inside DATA_DIR.`);
  }
  process.env[envKey] = resolved;
  return resolved;
}

export const WOR_IMAGES_DIR = resolveImagesDirUnderData('WOR_IMAGES_DIR', 'wor-images');
export const WARFRAME_IMAGES_DIR = resolveImagesDirUnderData(
  'WARFRAME_IMAGES_DIR',
  'warframe-images',
);
export const IMAGES_DIR = WARFRAME_IMAGES_DIR;

export const EXPORTS_DIR = path.join(DATA_DIR, 'warframe-exports');

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

const _port = parseInt(process.env.PORT || '3001', 10);
export const PORT = Number.isFinite(_port) && _port > 0 ? _port : 3001;

const _shutdownTimeoutMs = parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10);
export const SHUTDOWN_TIMEOUT_MS =
  Number.isFinite(_shutdownTimeoutMs) && _shutdownTimeoutMs > 0 ? _shutdownTimeoutMs : 10_000;
export const HOST = process.env.HOST || '127.0.0.1';
export const APP_NAME = process.env.APP_NAME?.trim() || 'Codex';
export const APP_ID = process.env.APP_ID?.trim() || 'codex';
export const NODE_ENV = process.env.NODE_ENV || 'production';

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
const ALLOWED_PROTOCOLS = ['http', 'https'] as const;
type AllowedProtocol = (typeof ALLOWED_PROTOCOLS)[number];

function validateBaseProtocol(value: string | undefined): AllowedProtocol {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return 'https';
  if (ALLOWED_PROTOCOLS.includes(normalized as AllowedProtocol)) {
    return normalized as AllowedProtocol;
  }

  console.warn(`Invalid BASE_PROTOCOL "${value}" provided; falling back to "https".`);
  return 'https';
}

export const BASE_PROTOCOL = validateBaseProtocol(process.env.BASE_PROTOCOL);

export const BASE_DOMAIN = process.env.BASE_DOMAIN?.trim().toLowerCase() || '';
if (!BASE_DOMAIN) {
  throw new Error('BASE_DOMAIN must be set.');
}
const DOMAIN_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
function isValidDomain(domain: string): boolean {
  const domainLabels = domain.split('.');
  return (
    domain.length <= 253 &&
    domainLabels.length >= 2 &&
    domainLabels.every(
      (label) => label.length >= 1 && label.length <= 63 && DOMAIN_LABEL_REGEX.test(label),
    ) &&
    domainLabels[domainLabels.length - 1].length >= 2
  );
}

const hasValidBaseDomain = isValidDomain(BASE_DOMAIN);
if (!hasValidBaseDomain) {
  throw new Error('BASE_DOMAIN must be a valid domain.');
}

export const APP_SUBDOMAIN = process.env.APP_SUBDOMAIN?.trim().toLowerCase() || APP_ID;
if (!DOMAIN_LABEL_REGEX.test(APP_SUBDOMAIN)) {
  throw new Error('APP_SUBDOMAIN is invalid.');
}

export const APP_PUBLIC_BASE_URL = getAppPublicBaseUrl();

export const LEGAL_PAGE_URL =
  process.env.VITE_LEGAL_PAGE_URL?.trim() ||
  process.env.LEGAL_PAGE_URL?.trim() ||
  'https://darkavianlabs.com/legal';

export function ensureDataDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(WARFRAME_DB_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(WARFRAME_CATALOG_DB_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(EPIC7_DB_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(WOR_DB_PATH), { recursive: true });
  fs.mkdirSync(path.dirname(WOR_CATALOG_DB_PATH), { recursive: true });
  fs.mkdirSync(WOR_IMAGES_DIR, { recursive: true });
  fs.mkdirSync(WARFRAME_IMAGES_DIR, { recursive: true });
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  if (!fs.existsSync(WARFRAME_CATALOG_DB_PATH)) {
    fs.writeFileSync(WARFRAME_CATALOG_DB_PATH, '');
  }
  if (!fs.existsSync(WOR_CATALOG_DB_PATH)) {
    fs.writeFileSync(WOR_CATALOG_DB_PATH, '');
  }
}

ensureDataDirs();

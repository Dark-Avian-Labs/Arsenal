import fs from 'fs';
import path from 'path';

import {
  getAppPublicBaseUrl,
  loadAppEnv,
  readPackageVersion,
  readReleaseVersion,
  readServerEnv,
  requireAbsoluteSqlitePath,
  resolveProjectRoot,
} from '@dark-avian-labs/server-kit';

export const PROJECT_ROOT = resolveProjectRoot(import.meta.url);
loadAppEnv(PROJECT_ROOT);

export const APP_VERSION = readReleaseVersion(PROJECT_ROOT, readPackageVersion(PROJECT_ROOT));

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

function canonicalPath(target: string): string {
  const resolved = path.resolve(target);
  const pending: string[] = [];
  let current = resolved;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return resolved;
    pending.push(path.basename(current));
    current = parent;
  }
  return path.join(fs.realpathSync(current), ...pending.reverse());
}

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
  const relative = path.relative(canonicalPath(DATA_DIR), canonicalPath(resolved));
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

const serverEnv = readServerEnv({ port: 3001, appName: 'Codex', appId: 'codex' });
export const PORT = serverEnv.PORT;
export const SHUTDOWN_TIMEOUT_MS = serverEnv.SHUTDOWN_TIMEOUT_MS;
export const HOST = serverEnv.HOST;
export const APP_NAME = serverEnv.APP_NAME;
export const APP_ID = serverEnv.APP_ID;
export const NODE_ENV = serverEnv.NODE_ENV;
export const TRUST_PROXY = serverEnv.TRUST_PROXY;
export const SECURE_COOKIES = serverEnv.SECURE_COOKIES;
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

export const LEGAL_PAGE_URL = serverEnv.LEGAL_PAGE_URL;

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

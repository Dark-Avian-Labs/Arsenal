import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenvx from '@dotenvx/dotenvx';

const { config: loadEnv } = dotenvx;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sentinelRoot = path.resolve(__dirname, '..');
const armoryRoot = path.resolve(sentinelRoot, '../Armory');

function decryptIntoEnv(root, file) {
  const keys = path.join(root, '.env.keys');
  const envFile = path.join(root, file);
  for (const k of Object.keys(process.env)) {
    if (
      k.startsWith('CLERK_') ||
      k.startsWith('VITE_') ||
      k.startsWith('E2E_') ||
      k === 'SESSION_SECRET' ||
      k === 'COOKIE_DOMAIN' ||
      k === 'ALLOWED_APP_ORIGINS' ||
      k === 'APP_PUBLIC_BASE_URL'
    ) {
      delete process.env[k];
    }
  }
  if (fs.existsSync(keys)) {
    loadEnv({ path: keys, quiet: true, overload: true });
  }
  loadEnv({ path: envFile, quiet: true, overload: true });
  return { ...process.env };
}

function pick(env, key) {
  return (env[key] ?? '').trim();
}

function writeEnvFile(filePath, rows) {
  const lines = [...rows.map(([k, v]) => `${k}=${v}`), ''];
  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
}

const armoryDev = decryptIntoEnv(armoryRoot, '.env.development');
const armoryProd = decryptIntoEnv(armoryRoot, '.env.production');

const clerkDev = {
  CLERK_SECRET_KEY: pick(armoryDev, 'CLERK_SECRET_KEY'),
  VITE_CLERK_PUBLISHABLE_KEY: pick(armoryDev, 'VITE_CLERK_PUBLISHABLE_KEY'),
  CLERK_FAPI_URL: pick(armoryDev, 'CLERK_FAPI_URL'),
  E2E_CLERK_USER_ID: pick(armoryDev, 'E2E_CLERK_USER_ID'),
  VITE_LEGAL_CONTACT_NAME: pick(armoryDev, 'VITE_LEGAL_CONTACT_NAME'),
  VITE_LEGAL_CONTACT_STREET: pick(armoryDev, 'VITE_LEGAL_CONTACT_STREET'),
  VITE_LEGAL_CONTACT_CITY: pick(armoryDev, 'VITE_LEGAL_CONTACT_CITY'),
  VITE_LEGAL_CONTACT_PHONE: pick(armoryDev, 'VITE_LEGAL_CONTACT_PHONE'),
  VITE_LEGAL_CONTACT_EMAIL: pick(armoryDev, 'VITE_LEGAL_CONTACT_EMAIL'),
  VITE_LEGAL_ENTITY_NAME: pick(armoryDev, 'VITE_LEGAL_ENTITY_NAME') || 'Dark Avian Labs',
};

const clerkProd = {
  CLERK_SECRET_KEY: pick(armoryProd, 'CLERK_SECRET_KEY'),
  VITE_CLERK_PUBLISHABLE_KEY: pick(armoryProd, 'VITE_CLERK_PUBLISHABLE_KEY'),
  CLERK_FAPI_URL: pick(armoryProd, 'CLERK_FAPI_URL'),
  COOKIE_DOMAIN: pick(armoryProd, 'COOKIE_DOMAIN') || '.darkavianlabs.com',
  VITE_SHARED_THEME_COOKIE_DOMAIN:
    pick(armoryProd, 'VITE_SHARED_THEME_COOKIE_DOMAIN') || '.darkavianlabs.com',
  VITE_LEGAL_CONTACT_NAME: pick(armoryProd, 'VITE_LEGAL_CONTACT_NAME'),
  VITE_LEGAL_CONTACT_STREET: pick(armoryProd, 'VITE_LEGAL_CONTACT_STREET'),
  VITE_LEGAL_CONTACT_CITY: pick(armoryProd, 'VITE_LEGAL_CONTACT_CITY'),
  VITE_LEGAL_CONTACT_PHONE: pick(armoryProd, 'VITE_LEGAL_CONTACT_PHONE'),
  VITE_LEGAL_CONTACT_EMAIL: pick(armoryProd, 'VITE_LEGAL_CONTACT_EMAIL'),
  VITE_LEGAL_ENTITY_NAME: pick(armoryProd, 'VITE_LEGAL_ENTITY_NAME') || 'Dark Avian Labs',
};

if (!clerkDev.CLERK_SECRET_KEY || !clerkDev.VITE_CLERK_PUBLISHABLE_KEY) {
  console.error('Armory development Clerk keys missing; aborting.');
  process.exit(1);
}
if (!clerkProd.CLERK_SECRET_KEY || !clerkProd.VITE_CLERK_PUBLISHABLE_KEY) {
  console.error('Armory production Clerk keys missing; aborting.');
  process.exit(1);
}

const sessionSecretDev = crypto.randomBytes(32).toString('base64');
const sessionSecretProd = crypto.randomBytes(32).toString('base64');
const ingestTokenDev = crypto.randomBytes(24).toString('base64url');
const ingestTokenProd = crypto.randomBytes(24).toString('base64url');

const allowed =
  'https://codex.darkavianlabs.com,https://armory.darkavianlabs.com,https://outfitter.darkavianlabs.com,https://budget.darkavianlabs.com,https://sentinel.darkavianlabs.com';

const keysPath = path.join(sentinelRoot, '.env.keys');
if (fs.existsSync(keysPath)) fs.unlinkSync(keysPath);
for (const f of ['.env.development', '.env.production']) {
  const p = path.join(sentinelRoot, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

const devRows = [
  ['PORT', '3005'],
  ['HOST', '127.0.0.1'],
  ['APP_NAME', 'Sentinel'],
  ['APP_ID', 'sentinel'],
  ['APP_PUBLIC_BASE_URL', 'http://127.0.0.1:3005'],
  ['ALLOWED_APP_ORIGINS', allowed],
  ['SESSION_SECRET', sessionSecretDev],
  ['SESSION_COOKIE_NAME', 'sentinel.sid'],
  ['SESSION_DB_PATH', './data/sessions.db'],
  ['METRICS_DB_PATH', './data/metrics.db'],
  ['SENTINEL_INGEST_TOKEN', ingestTokenDev],
  ['TRUST_PROXY', '0'],
  ['SECURE_COOKIES', '0'],
  ['CLERK_SECRET_KEY', clerkDev.CLERK_SECRET_KEY],
  ['VITE_CLERK_PUBLISHABLE_KEY', clerkDev.VITE_CLERK_PUBLISHABLE_KEY],
  ...(clerkDev.CLERK_FAPI_URL ? [['CLERK_FAPI_URL', clerkDev.CLERK_FAPI_URL]] : []),
  ['E2E_CLERK_USER_ID', clerkDev.E2E_CLERK_USER_ID],
  ['VITE_DEV_API_TARGET', 'http://127.0.0.1:3005'],
  ['VITE_DEV_PORT', '5176'],
  ['VITE_BASE_PATH', '/'],
  ['VITE_APP_NAME', 'Sentinel'],
  ['VITE_LEGAL_ENTITY_NAME', clerkDev.VITE_LEGAL_ENTITY_NAME],
  ['VITE_SEARCH_PLACEHOLDER', 'Search apps...'],
  ['VITE_LEGAL_CONTACT_NAME', clerkDev.VITE_LEGAL_CONTACT_NAME],
  ['VITE_LEGAL_CONTACT_STREET', clerkDev.VITE_LEGAL_CONTACT_STREET],
  ['VITE_LEGAL_CONTACT_CITY', clerkDev.VITE_LEGAL_CONTACT_CITY],
  ['VITE_LEGAL_CONTACT_PHONE', clerkDev.VITE_LEGAL_CONTACT_PHONE],
  ['VITE_LEGAL_CONTACT_EMAIL', clerkDev.VITE_LEGAL_CONTACT_EMAIL],
];

const prodRows = [
  ['PORT', '3005'],
  ['HOST', '127.0.0.1'],
  ['APP_NAME', 'Sentinel'],
  ['APP_ID', 'sentinel'],
  ['APP_PUBLIC_BASE_URL', 'https://sentinel.darkavianlabs.com'],
  ['ALLOWED_APP_ORIGINS', allowed],
  ['SESSION_SECRET', sessionSecretProd],
  ['SESSION_COOKIE_NAME', 'sentinel.sid'],
  ['SESSION_DB_PATH', './data/sessions.db'],
  ['METRICS_DB_PATH', './data/metrics.db'],
  ['SENTINEL_INGEST_TOKEN', ingestTokenProd],
  ['TRUST_PROXY', '1'],
  ['SECURE_COOKIES', '1'],
  ['COOKIE_DOMAIN', clerkProd.COOKIE_DOMAIN],
  ['CLERK_SECRET_KEY', clerkProd.CLERK_SECRET_KEY],
  ['VITE_CLERK_PUBLISHABLE_KEY', clerkProd.VITE_CLERK_PUBLISHABLE_KEY],
  ...(clerkProd.CLERK_FAPI_URL ? [['CLERK_FAPI_URL', clerkProd.CLERK_FAPI_URL]] : []),
  ['VITE_BASE_PATH', '/'],
  ['VITE_APP_NAME', 'Sentinel'],
  ['VITE_LEGAL_ENTITY_NAME', clerkProd.VITE_LEGAL_ENTITY_NAME],
  ['VITE_SEARCH_PLACEHOLDER', 'Search apps...'],
  ['VITE_SHARED_THEME_COOKIE_DOMAIN', clerkProd.VITE_SHARED_THEME_COOKIE_DOMAIN],
  ['VITE_LEGAL_CONTACT_NAME', clerkProd.VITE_LEGAL_CONTACT_NAME],
  ['VITE_LEGAL_CONTACT_STREET', clerkProd.VITE_LEGAL_CONTACT_STREET],
  ['VITE_LEGAL_CONTACT_CITY', clerkProd.VITE_LEGAL_CONTACT_CITY],
  ['VITE_LEGAL_CONTACT_PHONE', clerkProd.VITE_LEGAL_CONTACT_PHONE],
  ['VITE_LEGAL_CONTACT_EMAIL', clerkProd.VITE_LEGAL_CONTACT_EMAIL],
];

writeEnvFile(path.join(sentinelRoot, '.env.development'), devRows);
writeEnvFile(path.join(sentinelRoot, '.env.production'), prodRows);

const viteExclude = [
  'VITE_CLERK_PUBLISHABLE_KEY',
  'VITE_DEV_API_TARGET',
  'VITE_DEV_PORT',
  'VITE_BASE_PATH',
  'VITE_APP_NAME',
  'VITE_LEGAL_ENTITY_NAME',
  'VITE_SEARCH_PLACEHOLDER',
  'VITE_SHARED_THEME_COOKIE_DOMAIN',
  'VITE_LEGAL_CONTACT_NAME',
  'VITE_LEGAL_CONTACT_STREET',
  'VITE_LEGAL_CONTACT_CITY',
  'VITE_LEGAL_CONTACT_PHONE',
  'VITE_LEGAL_CONTACT_EMAIL',
];

function encryptFile(file, excludeKeys) {
  const args = [
    'exec',
    'dotenvx',
    'encrypt',
    '-f',
    file,
    '--no-native',
    '--no-armor',
    ...excludeKeys.flatMap((k) => ['-ek', k]),
  ];
  const r = spawnSync('pnpm', args, {
    cwd: sentinelRoot,
    encoding: 'utf8',
    shell: true,
  });
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    process.exit(r.status ?? 1);
  }
  console.log('encrypted', file);
}

encryptFile('.env.development', viteExclude);
encryptFile('.env.production', viteExclude);

console.log('Wrote .env.development, .env.production, and .env.keys');
console.log(
  'Clerk prefixes only:',
  'dev pk',
  clerkDev.VITE_CLERK_PUBLISHABLE_KEY.slice(0, 10),
  'prod pk',
  clerkProd.VITE_CLERK_PUBLISHABLE_KEY.slice(0, 10),
);

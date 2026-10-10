import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenvx from '@dotenvx/dotenvx';

const { config: loadEnv } = dotenvx;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sentinelRoot = path.resolve(__dirname, '..');
const labsRoot = path.resolve(sentinelRoot, '..');

function loadSentinelEnv(file) {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('SENTINEL_') || k.startsWith('DOTENV_PRIVATE')) delete process.env[k];
  }
  loadEnv({ path: path.join(sentinelRoot, '.env.keys'), quiet: true, overload: true });
  loadEnv({ path: path.join(sentinelRoot, file), quiet: true, overload: true });
  return {
    token: (process.env.SENTINEL_INGEST_TOKEN ?? '').trim(),
  };
}

function resolveDotenvxCli(appRoot) {
  const candidates = [
    path.join(appRoot, 'node_modules', '@dotenvx', 'dotenvx', 'src', 'cli', 'dotenvx.js'),
    path.join(sentinelRoot, 'node_modules', '@dotenvx', 'dotenvx', 'src', 'cli', 'dotenvx.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`dotenvx CLI not found under ${appRoot}`);
}

function setEnv(appRoot, file, key, value) {
  const cli = resolveDotenvxCli(appRoot);
  // dotenvx set treats an inherited process.env value as "already set" and skips
  // writing the encrypted file — scrub Sentinel keys so the child must write.
  const env = { ...process.env };
  delete env.SENTINEL_INGEST_TOKEN;
  delete env.SENTINEL_INGEST_URL;
  const r = spawnSync(
    process.execPath,
    [cli, 'set', key, value, '-f', file, '--no-native', '--no-armor'],
    { cwd: appRoot, encoding: 'utf8', windowsHide: true, env },
  );
  if (r.status !== 0) {
    throw new Error(`${appRoot} ${file} ${key}: ${r.stderr || r.stdout || `exit ${r.status}`}`);
  }
}

const labsSiblings = ['Outfitter', 'Armory', 'BudgetPlanner', 'Codex', 'TC-Bot'];
const externalSiblings = [
  path.resolve(labsRoot, '..', 'eMail Sort'),
  path.resolve(labsRoot, '..', 'Discord Profile'),
  path.resolve(labsRoot, '..', 'WoR Code Reminder'),
];
const pairs = [
  ['.env.development', 'http://127.0.0.1:3005/api/ingest'],
  ['.env.production', 'http://127.0.0.1:3005/api/ingest'],
];

for (const [file, ingestUrl] of pairs) {
  const { token } = loadSentinelEnv(file);
  if (!token) {
    console.error('SENTINEL_INGEST_TOKEN missing in Sentinel', file);
    process.exit(1);
  }
  const targets = [
    ...labsSiblings.map((app) => ({ label: app, root: path.join(labsRoot, app) })),
    ...externalSiblings.map((root) => ({ label: path.basename(root), root })),
  ];
  for (const { label, root } of targets) {
    const envPath = path.join(root, file);
    if (!fs.existsSync(envPath)) continue;
    try {
      setEnv(root, file, 'SENTINEL_INGEST_URL', ingestUrl);
      setEnv(root, file, 'SENTINEL_INGEST_TOKEN', token);
      console.log('set', label, file);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
}

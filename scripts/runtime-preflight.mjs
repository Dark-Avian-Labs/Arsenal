import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const MIN_NODE_MAJOR = 26;
const MIN_PNPM_MAJOR = 12;

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`\n[preflight] ${message}\n`);
  process.exit(1);
}

function parseMajor(version) {
  const match = /^v?(\d+)/.exec(String(version));
  return match ? Number(match[1]) : 0;
}

const nodeMajor = parseMajor(process.version);
if (nodeMajor < MIN_NODE_MAJOR) {
  fail(`Node ${MIN_NODE_MAJOR}+ required (current: ${process.version}).`);
}

try {
  const pkg = require('../package.json');
  const manager = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
  const pnpmMatch = /^pnpm@(\d+)/.exec(manager);
  if (pnpmMatch) {
    const requiredMajor = Number(pnpmMatch[1]);
    if (requiredMajor < MIN_PNPM_MAJOR) {
      fail(`pnpm ${MIN_PNPM_MAJOR}+ required per packageManager (${manager}).`);
    }
  }
} catch {}

try {
  const db = new DatabaseSync(':memory:');
  db.close();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  fail(`Built-in node:sqlite unavailable:\n  ${message}`);
}

console.log(`[preflight] OK — Node ${process.version}`);

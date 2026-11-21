import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SUB_APPS = ['codex', 'armory', 'outfitter', 'budget-planner'];

for (const app of SUB_APPS) {
  const indexHtml = path.join(REPO_ROOT, 'apps', app, 'dist', 'client', 'index.html');
  if (fs.existsSync(indexHtml)) {
    console.log(`[arsenal:build] Verified existing client bundle: ${app}`);
    continue;
  }
  console.log(`[arsenal:build] Building sub-app client: ${app}`);
  execFileSync('pnpm', ['--filter', app, 'run', 'build'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
console.log('[arsenal:build] All 4 sub-app clients ready.');

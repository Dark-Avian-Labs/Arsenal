import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SUB_APPS = ['codex', 'armory', 'outfitter', 'budget-planner'];

for (const app of SUB_APPS) {
  console.log(`[arsenal:build] Building sub-app client: ${app}`);
  execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['--filter', app, 'run', 'build'],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    },
  );
}
console.log('[arsenal:build] All 4 sub-app clients built cleanly.');

import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const APPS = ['armory', 'budget-planner', 'codex', 'sentinel', 'outfitter'];
const { BEFORE = '', AFTER = 'HEAD', FORCE = '' } = process.env;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

function emit(result) {
  const lines = APPS.map((app) => `${app}=${result[app] ? 'true' : 'false'}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
}

if (FORCE) {
  const wanted = FORCE === 'all' ? APPS : FORCE.split(',').map((entry) => entry.trim());
  emit(Object.fromEntries(APPS.map((app) => [app, wanted.includes(app)])));
  process.exit(0);
}

if (!BEFORE || /^0+$/.test(BEFORE) || git(['cat-file', '-e', `${BEFORE}^{commit}`]) === null) {
  console.log('No valid BEFORE commit; deploying everything');
  emit(Object.fromEntries(APPS.map((app) => [app, true])));
  process.exit(0);
}

const files = (git(['diff', '--name-only', BEFORE, AFTER]) ?? '').split('\n').filter(Boolean);
console.log(`Changed files:\n${files.join('\n')}`);

// A lockfile or devDependency bump can change the client bundle, so these paths deploy every app.
const global = files.some(
  (file) =>
    file.startsWith('packages/') ||
    file === 'pnpm-lock.yaml' ||
    file === 'pnpm-workspace.yaml' ||
    file.startsWith('scripts/ci/') ||
    file === '.forgejo/workflows/deploy.yml' ||
    file === '.forgejo/workflows/_deploy-app.yml',
);
emit(
  Object.fromEntries(
    APPS.map((app) => [app, global || files.some((file) => file.startsWith(`apps/${app}/`))]),
  ),
);

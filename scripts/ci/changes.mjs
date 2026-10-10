import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// Decides which apps to deploy. Outputs <app>=true|false for each app to GITHUB_OUTPUT.
// Rules: FORCE lists apps or "all"; otherwise diff BEFORE..AFTER. packages/, lockfile, workspace
// file, scripts/ci and the deploy workflows affect every app; apps/<x>/ affects x. A change that
// only touches dependency files and does not change any production dependency deploys nothing.

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

const isDepFile = (file) =>
  /(^|\/)package\.json$/.test(file) || file === 'pnpm-lock.yaml' || file === 'pnpm-workspace.yaml';
if (files.length > 0 && files.every(isDepFile)) {
  const prodSubset = (json) => {
    const manifest = JSON.parse(json || '{}');
    return JSON.stringify({
      d: manifest.dependencies ?? {},
      o: manifest.optionalDependencies ?? {},
      p: manifest.peerDependencies ?? {},
    });
  };
  let prodChanged = false;
  for (const file of files.filter((entry) => /(^|\/)package\.json$/.test(entry))) {
    if (
      prodSubset(git(['show', `${BEFORE}:${file}`])) !==
      prodSubset(git(['show', `${AFTER}:${file}`]))
    ) {
      prodChanged = true;
    }
  }
  if (files.includes('pnpm-workspace.yaml')) {
    const before = git(['show', `${BEFORE}:pnpm-workspace.yaml`]) ?? '';
    const after = git(['show', `${AFTER}:pnpm-workspace.yaml`]) ?? '';
    const catalogLines = (text) =>
      new Set(text.split('\n').filter((line) => /^\s{2}['"]?[@a-z]/.test(line)));
    const changedNames = [...catalogLines(after)]
      .filter((line) => !catalogLines(before).has(line))
      .map((line) => line.trim().split(':')[0].replace(/['"]/g, ''));
    const manifests = (git(['ls-files', '--', '**/package.json', 'package.json']) ?? '')
      .split('\n')
      .filter(Boolean);
    for (const manifestPath of manifests) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const prodNames = Object.keys({
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      });
      if (changedNames.some((name) => prodNames.includes(name))) prodChanged = true;
    }
  }
  if (!prodChanged) {
    console.log('Only development dependencies changed; nothing to deploy');
    emit(Object.fromEntries(APPS.map((app) => [app, false])));
    process.exit(0);
  }
}

const global = files.some(
  (file) =>
    file.startsWith('packages/') ||
    file === 'pnpm-lock.yaml' ||
    file === 'pnpm-workspace.yaml' ||
    file.startsWith('scripts/ci/') ||
    file.startsWith('.forgejo/workflows/'),
);
emit(
  Object.fromEntries(
    APPS.map((app) => [app, global || files.some((file) => file.startsWith(`apps/${app}/`))]),
  ),
);

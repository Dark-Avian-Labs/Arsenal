import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const APPS = ['armory', 'budget-planner', 'codex', 'sentinel', 'outfitter'];
const LABEL = {
  armory: 'Armory',
  'budget-planner': 'Budget',
  codex: 'Codex',
  sentinel: 'Sentinel',
  outfitter: 'Outfitter',
};

function planSummary(result, detail) {
  const rows = APPS.map((app) => `| ${LABEL[app]} | ${result[app] ? 'deploy' : 'skip'} |`);
  return ['| App | Plan |', '| --- | --- |', ...rows, '', detail].join('\n');
}

function sharedHits(files) {
  const hits = [];
  if (files.some((file) => file.startsWith('packages/'))) hits.push('packages/');
  if (files.includes('pnpm-lock.yaml')) hits.push('lockfile');
  if (files.includes('pnpm-workspace.yaml')) hits.push('workspace');
  if (files.some((file) => file.startsWith('scripts/ci/'))) hits.push('scripts/ci');
  if (
    files.some(
      (file) =>
        file === '.forgejo/workflows/deploy.yml' || file === '.forgejo/workflows/_deploy-app.yml',
    )
  ) {
    hits.push('deploy workflow');
  }
  return hits;
}

function writeStepSummary(text) {
  const file = process.env.FORGEJO_STEP_SUMMARY || process.env.GITHUB_STEP_SUMMARY;
  if (!file || !text) return;
  appendFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
}

function selfCheck() {
  const text = planSummary(
    { armory: true, 'budget-planner': false, codex: true, sentinel: false, outfitter: false },
    'Only apps with their own changes.',
  );
  if (!text.includes('| Armory | deploy |') || !text.includes('| Budget | skip |')) {
    throw new Error(text);
  }
  if (!text.endsWith('Only apps with their own changes.')) throw new Error(text);
  const hits = sharedHits(['packages/ui/src/a.ts', 'pnpm-lock.yaml', 'README.md']);
  if (hits.join(',') !== 'packages/,lockfile') throw new Error(hits.join(','));
  if (sharedHits(['apps/armory/src/a.ts']).length !== 0) throw new Error('app file is not shared');
  console.log('self-check ok');
}

if (process.argv.includes('--self-check')) {
  selfCheck();
  process.exit(0);
}

const { BEFORE = '', AFTER = 'HEAD', FORCE = '' } = process.env;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
}

function emit(result, detail) {
  const lines = APPS.map((app) => `${app}=${result[app] ? 'true' : 'false'}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  writeStepSummary(planSummary(result, detail));
  console.log(lines.join('\n'));
}

if (FORCE) {
  const wanted = FORCE === 'all' ? APPS : FORCE.split(',').map((entry) => entry.trim());
  emit(
    Object.fromEntries(APPS.map((app) => [app, wanted.includes(app)])),
    FORCE === 'all' ? 'Manual deploy of every app.' : 'Manual deploy.',
  );
  process.exit(0);
}

if (!BEFORE || /^0+$/.test(BEFORE) || git(['cat-file', '-e', `${BEFORE}^{commit}`]) === null) {
  console.log('No valid BEFORE commit; deploying everything');
  emit(Object.fromEntries(APPS.map((app) => [app, true])), 'No base commit, so every app deploys.');
  process.exit(0);
}

const files = (git(['diff', '--name-only', BEFORE, AFTER]) ?? '').split('\n').filter(Boolean);
console.log(`Changed files:\n${files.join('\n')}`);

const hits = sharedHits(files);
const global = hits.length > 0;
emit(
  Object.fromEntries(
    APPS.map((app) => [app, global || files.some((file) => file.startsWith(`apps/${app}/`))]),
  ),
  global
    ? `Shared change: ${hits.join(', ') || 'shared paths'}.`
    : 'Only apps with their own changes.',
);

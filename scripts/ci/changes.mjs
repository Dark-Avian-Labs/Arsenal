import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const SUB_APPS = ['armory', 'budget-planner', 'codex', 'outfitter', 'sentinel', 'template'];
const DEPLOY_SERVICES = ['arsenal', 'sentinel'];
const ARSENAL_MEMBERS = ['arsenal', 'armory', 'budget-planner', 'codex', 'outfitter'];

/**
 * Package-level dependency map: editing a game-specific package only invalidates the apps
 * that actually import it, instead of forcing a full-monorepo redeploy/E2E sweep.
 */
const PACKAGE_CONSUMERS = {
  'packages/wor-assets/': ['codex', 'outfitter'],
  'packages/warframe-catalog/': ['codex', 'armory'],
};

const LABEL = {
  arsenal: 'Arsenal',
  sentinel: 'Sentinel',
};

function planSummary(deployResult, detail) {
  const rows = DEPLOY_SERVICES.map(
    (service) => `| ${LABEL[service]} | ${deployResult[service] ? 'deploy' : 'skip'} |`,
  );
  return ['| Service | Plan |', '| --- | --- |', ...rows, '', detail].join('\n');
}

function classifyChanges(files) {
  const affected = Object.fromEntries(SUB_APPS.map((a) => [a, false]));
  let arsenalTouched = false;
  const globalHits = [];

  for (const file of files) {
    if (file === 'package.json') {
      globalHits.push('root package.json');
      continue;
    }
    if (file === 'pnpm-lock.yaml') {
      globalHits.push('lockfile');
      continue;
    }
    if (file === 'pnpm-workspace.yaml') {
      globalHits.push('workspace');
      continue;
    }
    if (file.startsWith('scripts/ci/')) {
      globalHits.push('scripts/ci');
      continue;
    }
    if (
      file === '.forgejo/workflows/deploy.yml' ||
      file === '.forgejo/workflows/_deploy-app.yml' ||
      file === '.forgejo/workflows/pr.yml'
    ) {
      globalHits.push('workflow');
      continue;
    }

    if (file.startsWith('packages/')) {
      let matchedScoped = false;
      for (const [prefix, consumers] of Object.entries(PACKAGE_CONSUMERS)) {
        if (file.startsWith(prefix)) {
          matchedScoped = true;
          for (const app of consumers) {
            affected[app] = true;
          }
          break;
        }
      }
      if (!matchedScoped) {
        globalHits.push(file.split('/').slice(0, 2).join('/'));
      }
      continue;
    }

    if (file.startsWith('apps/arsenal/')) {
      arsenalTouched = true;
      continue;
    }

    for (const app of SUB_APPS) {
      if (file.startsWith(`apps/${app}/`)) {
        affected[app] = true;
      }
    }
  }

  const uniqueGlobalHits = [...new Set(globalHits)];
  const global = uniqueGlobalHits.length > 0;
  if (global) {
    for (const app of SUB_APPS) affected[app] = true;
    arsenalTouched = true;
  }

  const arsenal =
    arsenalTouched || ARSENAL_MEMBERS.some((app) => app !== 'arsenal' && affected[app]);
  const deploy = {
    arsenal,
    sentinel: Boolean(affected.sentinel),
  };

  return {
    affected,
    deploy,
    global,
    globalHits: uniqueGlobalHits,
  };
}

function writeStepSummary(text) {
  const file = process.env.FORGEJO_STEP_SUMMARY || process.env.GITHUB_STEP_SUMMARY;
  if (!file || !text) return;
  appendFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
}

function selfCheck() {
  const worOnly = classifyChanges(['packages/wor-assets/src/index.ts']);
  if (
    !worOnly.affected.codex ||
    !worOnly.affected.outfitter ||
    worOnly.affected.sentinel ||
    worOnly.affected.armory
  ) {
    throw new Error(`wor-assets scope wrong: ${JSON.stringify(worOnly)}`);
  }
  if (!worOnly.deploy.arsenal || worOnly.deploy.sentinel) {
    throw new Error(`wor-assets deploy wrong: ${JSON.stringify(worOnly.deploy)}`);
  }

  const sentinelOnly = classifyChanges(['apps/sentinel/server/index.ts']);
  if (sentinelOnly.deploy.arsenal || !sentinelOnly.deploy.sentinel) {
    throw new Error(`sentinel-only wrong: ${JSON.stringify(sentinelOnly.deploy)}`);
  }

  const wfCat = classifyChanges(['packages/warframe-catalog/src/queries.ts']);
  if (
    !wfCat.affected.codex ||
    !wfCat.affected.armory ||
    wfCat.affected.outfitter ||
    wfCat.affected.sentinel
  ) {
    throw new Error(`warframe-catalog scope wrong: ${JSON.stringify(wfCat)}`);
  }

  const sharedUi = classifyChanges(['packages/ui/src/a.ts']);
  if (!sharedUi.global || !sharedUi.deploy.arsenal || !sharedUi.deploy.sentinel) {
    throw new Error(`shared ui scope wrong: ${JSON.stringify(sharedUi)}`);
  }

  const text = planSummary({ arsenal: true, sentinel: false }, 'Scoped changes.');
  if (!text.includes('| Arsenal | deploy |') || !text.includes('| Sentinel | skip |')) {
    throw new Error(text);
  }
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

function emit(deployResult, affectedApps, detail) {
  const lines = [
    ...DEPLOY_SERVICES.map((service) => `${service}=${deployResult[service] ? 'true' : 'false'}`),
    ...SUB_APPS.filter((a) => a !== 'sentinel').map(
      (app) => `${app}=${affectedApps[app] ? 'true' : 'false'}`,
    ),
  ];
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
  writeStepSummary(planSummary(deployResult, detail));
  console.log(lines.join('\n'));
}

if (FORCE) {
  const wanted =
    FORCE === 'all'
      ? [...DEPLOY_SERVICES, ...SUB_APPS]
      : FORCE.split(',').map((entry) => entry.trim());
  const deployResult = {
    arsenal: wanted.some((w) => ARSENAL_MEMBERS.includes(w)),
    sentinel: wanted.includes('sentinel'),
  };
  const affectedApps = Object.fromEntries(
    SUB_APPS.map((app) => [
      app,
      wanted.includes(app) || (app !== 'sentinel' && wanted.includes('arsenal')),
    ]),
  );
  emit(
    deployResult,
    affectedApps,
    FORCE === 'all' ? 'Manual deploy of every service.' : 'Manual deploy.',
  );
  process.exit(0);
}

if (!BEFORE || /^0+$/.test(BEFORE) || git(['cat-file', '-e', `${BEFORE}^{commit}`]) === null) {
  console.log('No valid BEFORE commit; deploying everything');
  emit(
    { arsenal: true, sentinel: true },
    Object.fromEntries(SUB_APPS.map((a) => [a, true])),
    'No base commit, so every service deploys.',
  );
  process.exit(0);
}

const files = (git(['diff', '--name-only', BEFORE, AFTER]) ?? '').split('\n').filter(Boolean);
console.log(`Changed files:\n${files.join('\n')}`);

const { affected, deploy, global, globalHits } = classifyChanges(files);
emit(
  deploy,
  affected,
  global ? `Shared change: ${globalHits.join(', ')}.` : 'Package-aware scoped changes.',
);

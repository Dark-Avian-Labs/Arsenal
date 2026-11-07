import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function releaseSummary(app, version, previous, release, notes) {
  if (!release) return `**${app}** \`${version}\` redeploy, no new commits.`;
  const heading = previous
    ? `**${app}** \`${previous}\` → \`${version}\``
    : `**${app}** \`${version}\``;
  const lines = String(notes)
    .split('\n')
    .filter((line) => line.trim());
  // ponytail: first 12 notes. The Forgejo release body keeps the full list.
  const shown = lines.slice(0, 12);
  const extra = lines.length - shown.length;
  const body = extra ? [...shown, `- ${extra} more commits`] : shown;
  return [heading, '', ...body].join('\n');
}

function writeStepSummary(text) {
  const file = process.env.FORGEJO_STEP_SUMMARY || process.env.GITHUB_STEP_SUMMARY;
  if (!file || !text) return;
  appendFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
}

if (process.argv.includes('--self-check')) {
  const redeploy = releaseSummary('armory', '1.2.3', '1.2.3', false, '- Redeploy\n');
  if (redeploy !== '**armory** `1.2.3` redeploy, no new commits.') throw new Error(redeploy);
  const bumped = releaseSummary('armory', '1.3.0', '1.2.3', true, '- feat: x (#4) abc1234\n');
  if (!bumped.startsWith('**armory** `1.2.3` → `1.3.0`')) throw new Error(bumped);
  if (!bumped.includes('- feat: x (#4) abc1234')) throw new Error(bumped);
  const many = releaseSummary(
    'codex',
    '1.0.0',
    null,
    true,
    Array.from({ length: 14 }, (_, index) => `- c${index}`).join('\n'),
  );
  if (!many.startsWith('**codex** `1.0.0`')) throw new Error(many);
  if (!many.includes('- 2 more commits')) throw new Error(many);
  console.log('self-check ok');
  process.exit(0);
}

const app = process.argv[2];
if (!app || !/^[\w.-]+$/.test(app)) throw new Error('app required');
if (!existsSync(path.join('apps', app, 'package.json'))) throw new Error(`unknown app ${app}`);
const prefix = `${app}-v`;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

let previous = null;
try {
  previous = git(['describe', '--tags', '--abbrev=0', '--match', `${prefix}*`]).slice(
    prefix.length,
  );
} catch {}

const range = previous ? `${prefix}${previous}..HEAD` : 'HEAD';
const paths = [
  '--',
  `apps/${app}`,
  'packages',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
];
const raw = git(['log', '--first-parent', '--format=%H%x1f%s%x1f%b%x1e', range, ...paths]);
const commits = raw
  .split('\x1e')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [sha, subject, body] = entry.split('\x1f');
    const pr = /^Merge pull request '(.+)' \(#(\d+)\)/.exec(subject);
    return {
      sha: sha.slice(0, 7),
      subject: pr ? pr[1] : subject,
      pr: pr ? pr[2] : null,
      body: body ?? '',
    };
  });

function bumpOf({ subject, body }) {
  const match = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  if ((match && match[3]) || /BREAKING CHANGE/.test(body)) return 'major';
  if (match && match[1] === 'feat') return 'minor';
  return 'patch';
}

let version = previous ?? '0.0.0';
const release = commits.length > 0;
if (release) {
  const level = commits.map(bumpOf).includes('major')
    ? 'major'
    : commits.map(bumpOf).includes('minor')
      ? 'minor'
      : 'patch';
  const [major, minor, patch] = version.split('.').map(Number);
  version =
    level === 'major'
      ? `${major + 1}.0.0`
      : level === 'minor'
        ? `${major}.${minor + 1}.0`
        : `${major}.${minor}.${patch + 1}`;
}

const notes =
  commits
    .map((commit) => `- ${commit.subject}${commit.pr ? ` (#${commit.pr})` : ''} ${commit.sha}`)
    .join('\n') || '- Redeploy, no new commits for this app.';
const notesPath = path.join(process.env.RUNNER_TEMP ?? '.', `notes-${app}.md`);
writeFileSync(notesPath, `${notes}\n`);
writeStepSummary(releaseSummary(app, version, previous, release, notes));

const out = [
  `version=${version}`,
  `previous=${previous ?? ''}`,
  `release=${release}`,
  `tag=${prefix}${version}`,
  `notes_path=${notesPath}`,
];
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${out.join('\n')}\n`);
console.log(out.join('\n'));
console.log(notes);

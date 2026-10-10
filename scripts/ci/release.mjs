import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Usage: node scripts/ci/release.mjs <app-dir-name>
// The repo has one tag, v1.0.0. App versions stay in package.json.
// ponytail: each commit since that tag bumps the package.json version once, oldest first.
// A newer v* tag starts a new range from the same package.json floor, so bump package.json
// to the last deployed version before tagging if the numbers should continue.
// `tag` stays empty. This script does not create <app>-v* tags.

const app = process.argv[2];
if (!app || !/^[\w.-]+$/.test(app)) throw new Error('app required');
const pkgPath = path.join('apps', app, 'package.json');
if (!existsSync(pkgPath)) throw new Error(`unknown app ${app}`);

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const previous = typeof pkg.version === 'string' ? pkg.version.trim() : '';
if (!/^\d+\.\d+\.\d+$/.test(previous)) {
  throw new Error(`${pkgPath} version must be x.y.z`);
}

let since = '';
try {
  since = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
} catch {
  since = '';
}

const range = since ? `${since}..HEAD` : 'HEAD';
const paths = ['--', `apps/${app}`, 'packages', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'];
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

function applyBump(version, level) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

let version = previous;
const release = commits.length > 0;
if (release) {
  for (const commit of commits.slice().reverse()) {
    version = applyBump(version, bumpOf(commit));
  }
}

const notes =
  commits
    .map((commit) => `- ${commit.subject}${commit.pr ? ` (#${commit.pr})` : ''} ${commit.sha}`)
    .join('\n') || '- Redeploy, no new commits for this app.';
const notesPath = path.join(process.env.RUNNER_TEMP ?? '.', `notes-${app}.md`);
writeFileSync(notesPath, `${notes}\n`);

const out = [
  `version=${version}`,
  `previous=${previous}`,
  `release=${release}`,
  'tag=',
  `notes_path=${notesPath}`,
];
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${out.join('\n')}\n`);
console.log(out.join('\n'));
console.log(notes);

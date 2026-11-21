import { appendFileSync } from 'node:fs';

const APPS = [
  ['Arsenal', 'ARSENAL'],
  ['Sentinel', 'SENTINEL'],
];

function join(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}

function bucket(result) {
  if (result === 'success' || result === 'skipped' || result === 'cancelled') return result;
  return 'failure';
}

function deployNote(results, changes = 'success') {
  if (changes === 'cancelled') return 'Deploy was cancelled.';
  if (changes !== 'success') return 'Change detection failed.';

  const names = (status) =>
    APPS.filter(([, key]) => bucket(results[key]) === status).map(([name]) => name);
  const failed = names('failure');
  const deployed = names('success');
  const cancelled = names('cancelled');
  const skipped = names('skipped');
  const parts = [];
  if (failed.length) parts.push(`${join(failed)} failed`);
  if (cancelled.length) parts.push(`${join(cancelled)} cancelled`);
  if (deployed.length) parts.push(`Deployed ${join(deployed)}`);
  if (skipped.length) parts.push(`Skipped ${join(skipped)}`);
  return parts.length ? `${parts.join('. ')}.` : 'Nothing deployed.';
}

function selfCheck() {
  const expect = (got, wanted) => {
    if (got !== wanted) throw new Error(`${got} !== ${wanted}`);
  };
  expect(
    deployNote({ ARSENAL: 'success', SENTINEL: 'success' }, 'success'),
    'Deployed Arsenal and Sentinel.',
  );
  expect(
    deployNote({ ARSENAL: 'skipped', SENTINEL: 'skipped' }, 'success'),
    'Skipped Arsenal and Sentinel.',
  );
  expect(
    deployNote({ ARSENAL: 'success', SENTINEL: 'success' }, 'failure'),
    'Change detection failed.',
  );
  expect(
    deployNote({ ARSENAL: 'skipped', SENTINEL: 'skipped' }, 'cancelled'),
    'Deploy was cancelled.',
  );
  expect(
    deployNote({ ARSENAL: 'success', SENTINEL: 'skipped' }, 'success'),
    'Deployed Arsenal. Skipped Sentinel.',
  );
  expect(
    deployNote({ ARSENAL: 'failure', SENTINEL: 'success' }, 'success'),
    'Arsenal failed. Deployed Sentinel.',
  );
  console.log('self-check ok');
}

if (process.argv.includes('--self-check')) {
  selfCheck();
  process.exit(0);
}

const text = deployNote(
  {
    ARSENAL: process.env.ARSENAL,
    SENTINEL: process.env.SENTINEL,
  },
  process.env.CHANGES,
);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `description=${text}\n`);
const summary = process.env.FORGEJO_STEP_SUMMARY || process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, `${text}\n`);
console.log(text);

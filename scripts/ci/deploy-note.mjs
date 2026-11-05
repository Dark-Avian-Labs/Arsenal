import { appendFileSync } from 'node:fs';

const APPS = [
  ['Armory', 'ARMORY'],
  ['Budget', 'BUDGET'],
  ['Codex', 'CODEX'],
  ['Sentinel', 'SENTINEL'],
  ['Outfitter', 'OUTFITTER'],
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
  const all = (status) => ({
    ARMORY: status,
    BUDGET: status,
    CODEX: status,
    SENTINEL: status,
    OUTFITTER: status,
  });
  const expect = (got, wanted) => {
    if (got !== wanted) throw new Error(`${got} !== ${wanted}`);
  };
  expect(
    deployNote(all('success'), 'success'),
    'Deployed Armory, Budget, Codex, Sentinel, and Outfitter.',
  );
  expect(
    deployNote(all('skipped'), 'success'),
    'Skipped Armory, Budget, Codex, Sentinel, and Outfitter.',
  );
  expect(deployNote(all('success'), 'failure'), 'Change detection failed.');
  expect(deployNote(all('skipped'), 'cancelled'), 'Deploy was cancelled.');
  expect(
    deployNote(
      {
        ARMORY: 'success',
        BUDGET: 'skipped',
        CODEX: 'success',
        SENTINEL: 'skipped',
        OUTFITTER: 'skipped',
      },
      'success',
    ),
    'Deployed Armory and Codex. Skipped Budget, Sentinel, and Outfitter.',
  );
  expect(
    deployNote(
      {
        ARMORY: 'success',
        BUDGET: 'skipped',
        CODEX: 'failure',
        SENTINEL: 'skipped',
        OUTFITTER: 'skipped',
      },
      'success',
    ),
    'Codex failed. Deployed Armory. Skipped Budget, Sentinel, and Outfitter.',
  );
  expect(
    deployNote(
      {
        ARMORY: 'success',
        BUDGET: 'success',
        CODEX: 'timed_out',
        SENTINEL: 'success',
        OUTFITTER: 'cancelled',
      },
      'success',
    ),
    'Codex failed. Outfitter cancelled. Deployed Armory, Budget, and Sentinel.',
  );
  console.log('self-check ok');
}

if (process.argv.includes('--self-check')) {
  selfCheck();
  process.exit(0);
}

const text = deployNote(
  {
    ARMORY: process.env.ARMORY,
    BUDGET: process.env.BUDGET,
    CODEX: process.env.CODEX,
    SENTINEL: process.env.SENTINEL,
    OUTFITTER: process.env.OUTFITTER,
  },
  process.env.CHANGES,
);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `description=${text}\n`);
const summary = process.env.FORGEJO_STEP_SUMMARY || process.env.GITHUB_STEP_SUMMARY;
if (summary) appendFileSync(summary, `${text}\n`);
console.log(text);

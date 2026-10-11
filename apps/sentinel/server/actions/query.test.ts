import { afterEach, describe, expect, it } from 'vitest';

import { closeActionsDb, getActionsDb } from './db.ts';
import { durationNsToMs, mapForgejoRun } from './map.ts';
import { listRuns, querySeries, summarizeRuns } from './query.ts';
import { upsertRun } from './writer.ts';

afterEach(() => {
  closeActionsDb();
});

describe('mapForgejoRun', () => {
  it('maps a Forgejo workflow run payload', () => {
    const row = mapForgejoRun(
      {
        id: 1195,
        title: 'Dependency updates',
        workflow_id: 'dependencies.yml',
        index_in_repo: 12,
        prettyref: 'main',
        commit_sha: '9957650b2b62eefd5e5dd94390ee3391f7a8c34a',
        event: 'schedule',
        status: 'failure',
        started: '2026-10-11T03:12:14+02:00',
        stopped: '2026-10-11T03:12:23+02:00',
        created: '2026-10-11T03:12:13+02:00',
        updated: '2026-10-11T03:12:23+02:00',
        duration: 9_000_000_000,
        html_url: 'https://git.darkavianlabs.com/Dark-Avian-Labs/Arsenal/actions/runs/12',
        repository: {
          name: 'Arsenal',
          owner: { login: 'Dark-Avian-Labs' },
        },
      },
      'fallback',
      'fallback',
    );

    expect(row.owner).toBe('Dark-Avian-Labs');
    expect(row.repo).toBe('Arsenal');
    expect(row.workflowId).toBe('dependencies.yml');
    expect(row.status).toBe('failure');
    expect(row.durationMs).toBe(9000);
    expect(durationNsToMs(9_000_000_000)).toBe(9000);
  });
});

describe('actions query', () => {
  it('filters dependency failures and builds a repo rollup', () => {
    const db = getActionsDb();
    const now = Date.parse('2026-10-11T12:00:00Z');

    upsertRun(db, {
      owner: 'Dark-Avian-Labs',
      repo: 'Arsenal',
      runId: 1,
      workflowId: 'dependencies.yml',
      title: 'Dependency updates',
      status: 'failure',
      event: 'schedule',
      ref: 'main',
      commitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      runNumber: 1,
      htmlUrl: 'https://git.darkavianlabs.com/Dark-Avian-Labs/Arsenal/actions/runs/1',
      startedAt: now - 60_000,
      stoppedAt: now - 50_000,
      durationMs: 10_000,
      createdAt: now - 61_000,
      updatedAt: now - 50_000,
    });
    upsertRun(db, {
      owner: 'Dark-Avian-Labs',
      repo: 'Homepage',
      runId: 2,
      workflowId: 'dependencies.yml',
      title: 'Dependency updates',
      status: 'failure',
      event: 'schedule',
      ref: 'main',
      commitSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      runNumber: 2,
      htmlUrl: 'https://git.darkavianlabs.com/Dark-Avian-Labs/Homepage/actions/runs/2',
      startedAt: now - 120_000,
      stoppedAt: now - 100_000,
      durationMs: 20_000,
      createdAt: now - 121_000,
      updatedAt: now - 100_000,
    });
    upsertRun(db, {
      owner: 'Dark-Avian-Labs',
      repo: 'Arsenal',
      runId: 3,
      workflowId: 'dependencies.yml',
      title: 'Dependency updates',
      status: 'success',
      event: 'schedule',
      ref: 'main',
      commitSha: 'cccccccccccccccccccccccccccccccccccccccc',
      runNumber: 3,
      htmlUrl: 'https://git.darkavianlabs.com/Dark-Avian-Labs/Arsenal/actions/runs/3',
      // Newer than Arsenal's failure — recovered, so rollup should drop Arsenal.
      startedAt: now - 20_000,
      stoppedAt: now - 10_000,
      durationMs: 10_000,
      createdAt: now - 21_000,
      updatedAt: now - 10_000,
    });
    upsertRun(db, {
      owner: 'Dark-Avian-Labs',
      repo: 'Arsenal',
      runId: 4,
      workflowId: 'pr.yml',
      title: 'Pull request',
      status: 'failure',
      event: 'pull_request',
      ref: '#1',
      commitSha: 'dddddddddddddddddddddddddddddddddddddddd',
      runNumber: 4,
      htmlUrl: 'https://git.darkavianlabs.com/Dark-Avian-Labs/Arsenal/actions/runs/4',
      startedAt: now - 30_000,
      stoppedAt: now - 20_000,
      durationMs: 10_000,
      createdAt: now - 31_000,
      updatedAt: now - 20_000,
    });
    upsertRun(db, {
      owner: 'Dark-Avian-Labs',
      repo: 'Arsenal',
      runId: 5,
      workflowId: 'dependencies.yml',
      title: 'Dependency updates',
      status: 'cancelled',
      event: 'schedule',
      ref: 'main',
      commitSha: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      runNumber: 5,
      htmlUrl: 'https://git.darkavianlabs.com/Dark-Avian-Labs/Arsenal/actions/runs/5',
      startedAt: now - 240_000,
      stoppedAt: now - 230_000,
      durationMs: 5_000,
      createdAt: now - 241_000,
      updatedAt: now - 230_000,
    });

    const failed = listRuns(db, {
      workflow: 'dependency',
      status: 'failure',
      range: '24h',
      now,
    });
    expect(failed).toHaveLength(2);
    expect(failed.map((row) => row.repo).sort()).toEqual(['Arsenal', 'Homepage']);

    const summary = summarizeRuns(db, {
      workflow: 'dependency',
      range: '24h',
      now,
    });
    expect(summary.runCount).toBe(4);
    expect(summary.successCount).toBe(1);
    expect(summary.failureCount).toBe(2);
    expect(summary.failurePercent).toBeCloseTo((2 / 3) * 100, 5);
    expect(summary.repos).toHaveLength(1);
    expect(summary.repos[0]?.repo).toBe('Homepage');
    expect(summary.repos[0]?.failedCount).toBe(1);
    expect(summary.medianDurationMs).toBe(10_000);

    const series = querySeries(db, {
      workflow: 'dependency',
      range: '24h',
      now,
    });
    const hourMs = 60 * 60 * 1000;
    expect(series[series.length - 1]?.ts).toBe(Math.floor(now / hourMs) * hourMs);
    const filled = series.filter((point) => point.total > 0);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.reduce((sum, point) => sum + point.total, 0)).toBe(4);
    expect(filled.reduce((sum, point) => sum + point.failure, 0)).toBe(2);

    // Incomplete owner/repo inputs use LIKE, not an empty exact match.
    expect(listRuns(db, { repo: 'Dark-Avian-Labs/', range: '24h', now }).length).toBeGreaterThan(0);
    expect(listRuns(db, { repo: 'a/b/c', range: '24h', now })).toHaveLength(0);
    const exact = listRuns(db, { repo: 'Dark-Avian-Labs/Arsenal', range: '24h', now });
    expect(exact.length).toBeGreaterThan(0);
    expect(exact.every((row) => row.repo === 'Arsenal')).toBe(true);
  });
});

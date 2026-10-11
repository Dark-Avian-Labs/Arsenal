import type Database from 'better-sqlite3';

export type ActionsRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'today';

export type RunListItem = {
  owner: string;
  repo: string;
  runId: number;
  workflowId: string;
  title: string;
  status: string;
  event: string;
  ref: string | null;
  commitSha: string | null;
  runNumber: number;
  htmlUrl: string;
  startedAt: number | null;
  stoppedAt: number | null;
  durationMs: number | null;
};

export type RepoRollup = {
  owner: string;
  repo: string;
  failedCount: number;
  lastFailureAt: number | null;
  lastCommitSha: string | null;
  lastHtmlUrl: string | null;
};

export type ActionsSummary = {
  runCount: number;
  successCount: number;
  failureCount: number;
  failurePercent: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  repos: RepoRollup[];
};

export type SeriesPoint = {
  ts: number;
  success: number;
  failure: number;
  other: number;
  total: number;
  medianDurationMs: number | null;
};

export type SyncStatus = {
  configured: boolean;
  bootstrapped: boolean;
  lastPollAt: number | null;
  lastPollError: string | null;
  repos: Array<{
    owner: string;
    repo: string;
    lastOkAt: number | null;
    lastError: string | null;
    lastErrorAt: number | null;
  }>;
};

const RANGE_MS: Record<Exclude<ActionsRange, 'today'>, number> = {
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

type SqlFilters = {
  where: string[];
  params: Record<string, unknown>;
};

function rangeWindow(range: ActionsRange, now: number): { since: number; spanMs: number } {
  if (range === 'today') {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const since = dayStart.getTime();
    return { since, spanMs: Math.max(now - since, 60_000) };
  }
  const spanMs = RANGE_MS[range];
  return { since: now - spanMs, spanMs };
}

function buildFilters(options: {
  workflow?: string;
  status?: string;
  repo?: string;
  range: ActionsRange;
  now?: number;
}): SqlFilters {
  const now = options.now ?? Date.now();
  const { since } = rangeWindow(options.range, now);
  const where = ['COALESCE(started_at, created_at) >= @since'];
  const params: Record<string, unknown> = { since };

  const workflow = options.workflow?.trim().toLowerCase();
  if (workflow) {
    where.push('(LOWER(workflow_id) LIKE @workflow OR LOWER(title) LIKE @workflow)');
    params.workflow = `%${workflow}%`;
  }

  const status = options.status?.trim().toLowerCase();
  if (status && status !== 'any') {
    where.push('LOWER(status) = @status');
    params.status = status;
  }

  const repo = options.repo?.trim().toLowerCase();
  if (repo) {
    const [owner, name, ...rest] = repo.split('/');
    if (owner && name && rest.length === 0) {
      where.push('LOWER(owner) = @owner AND LOWER(repo) = @repoName');
      params.owner = owner;
      params.repoName = name;
    } else {
      where.push("(LOWER(repo) LIKE @repo OR LOWER(owner || '/' || repo) LIKE @repo)");
      params.repo = `%${repo}%`;
    }
  }

  return { where, params };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low]!;
  const weight = rank - low;
  return Math.round(sorted[low]! * (1 - weight) + sorted[high]! * weight);
}

export function listRuns(
  db: Database.Database,
  options: {
    workflow?: string;
    status?: string;
    repo?: string;
    range: ActionsRange;
    limit?: number;
    now?: number;
  },
): RunListItem[] {
  const { where, params } = buildFilters(options);
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  return db
    .prepare(
      `SELECT
        owner, repo, run_id AS runId, workflow_id AS workflowId, title, status, event,
        ref, commit_sha AS commitSha, run_number AS runNumber, html_url AS htmlUrl,
        started_at AS startedAt, stopped_at AS stoppedAt, duration_ms AS durationMs
       FROM runs
       WHERE ${where.join(' AND ')}
       ORDER BY COALESCE(started_at, created_at) DESC
       LIMIT ${limit}`,
    )
    .all(params) as RunListItem[];
}

export function summarizeRuns(
  db: Database.Database,
  options: {
    workflow?: string;
    status?: string;
    repo?: string;
    range: ActionsRange;
    now?: number;
  },
): ActionsSummary {
  const { where, params } = buildFilters(options);
  const rows = db
    .prepare(
      `SELECT status, duration_ms AS durationMs, owner, repo, started_at AS startedAt,
              commit_sha AS commitSha, html_url AS htmlUrl
       FROM runs
       WHERE ${where.join(' AND ')}`,
    )
    .all(params) as Array<{
    status: string;
    durationMs: number | null;
    owner: string;
    repo: string;
    startedAt: number | null;
    commitSha: string | null;
    htmlUrl: string;
  }>;

  let successCount = 0;
  let failureCount = 0;
  const finishedDurations: number[] = [];
  const failByRepo = new Map<
    string,
    {
      owner: string;
      repo: string;
      failedCount: number;
      lastFailureAt: number | null;
      lastCommitSha: string | null;
      lastHtmlUrl: string | null;
    }
  >();

  for (const row of rows) {
    if (row.status === 'success') successCount += 1;
    if (row.status === 'failure') {
      failureCount += 1;
      const key = `${row.owner}/${row.repo}`;
      const existing = failByRepo.get(key) ?? {
        owner: row.owner,
        repo: row.repo,
        failedCount: 0,
        lastFailureAt: null,
        lastCommitSha: null,
        lastHtmlUrl: null,
      };
      existing.failedCount += 1;
      if (
        row.startedAt != null &&
        (existing.lastFailureAt == null || row.startedAt > existing.lastFailureAt)
      ) {
        existing.lastFailureAt = row.startedAt;
        existing.lastCommitSha = row.commitSha;
        existing.lastHtmlUrl = row.htmlUrl;
      }
      failByRepo.set(key, existing);
    }
    if (
      row.durationMs != null &&
      Number.isFinite(row.durationMs) &&
      (row.status === 'success' ||
        row.status === 'failure' ||
        row.status === 'cancelled' ||
        row.status === 'skipped')
    ) {
      finishedDurations.push(row.durationMs);
    }
  }

  finishedDurations.sort((a, b) => a - b);
  const decided = successCount + failureCount;
  const workflowSet = Boolean(options.workflow?.trim());

  return {
    runCount: rows.length,
    successCount,
    failureCount,
    failurePercent: decided === 0 ? null : (failureCount / decided) * 100,
    medianDurationMs: percentile(finishedDurations, 0.5),
    p95DurationMs: percentile(finishedDurations, 0.95),
    repos: workflowSet
      ? [...failByRepo.values()].sort(
          (a, b) =>
            b.failedCount - a.failedCount || (b.lastFailureAt ?? 0) - (a.lastFailureAt ?? 0),
        )
      : [],
  };
}

function bucketMsForRange(range: ActionsRange): number {
  if (range === '1h') return 5 * 60 * 1000;
  if (range === '6h') return 15 * 60 * 1000;
  if (range === '24h' || range === 'today') return 60 * 60 * 1000;
  if (range === '7d') return 6 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

export function querySeries(
  db: Database.Database,
  options: {
    workflow?: string;
    status?: string;
    repo?: string;
    range: ActionsRange;
    now?: number;
  },
): SeriesPoint[] {
  const now = options.now ?? Date.now();
  const { where, params } = buildFilters({ ...options, now });
  const bucketMs = bucketMsForRange(options.range);
  const { since, spanMs } = rangeWindow(options.range, now);
  const rows = db
    .prepare(
      `SELECT status, duration_ms AS durationMs, COALESCE(started_at, created_at) AS ts
       FROM runs
       WHERE ${where.join(' AND ')}
       ORDER BY ts ASC`,
    )
    .all(params) as Array<{ status: string; durationMs: number | null; ts: number }>;

  const bucketCount = Math.max(1, Math.ceil(spanMs / bucketMs));
  const startBucket = Math.floor(since / bucketMs) * bucketMs;
  const buckets: SeriesPoint[] = [];
  const durationBuckets: number[][] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    buckets.push({
      ts: startBucket + i * bucketMs,
      success: 0,
      failure: 0,
      other: 0,
      total: 0,
      medianDurationMs: null,
    });
    durationBuckets.push([]);
  }

  for (const row of rows) {
    if (row.ts == null || !Number.isFinite(row.ts)) continue;
    const index = Math.floor((row.ts - startBucket) / bucketMs);
    if (index < 0 || index >= buckets.length) continue;
    const bucket = buckets[index]!;
    if (row.status === 'success') bucket.success += 1;
    else if (row.status === 'failure') bucket.failure += 1;
    else bucket.other += 1;
    bucket.total += 1;
    if (row.durationMs != null && Number.isFinite(row.durationMs) && row.durationMs >= 0) {
      durationBuckets[index]!.push(row.durationMs);
    }
  }

  for (let i = 0; i < buckets.length; i += 1) {
    buckets[i]!.medianDurationMs = medianOf(durationBuckets[i]!);
  }
  return buckets;
}

export function getSyncStatus(db: Database.Database, configured: boolean): SyncStatus {
  const bootstrapped = Boolean(
    (
      db.prepare(`SELECT value FROM poller_meta WHERE key = 'bootstrapped'`).get() as
        | { value: string }
        | undefined
    )?.value,
  );
  const lastPollAtRaw = (
    db.prepare(`SELECT value FROM poller_meta WHERE key = 'last_poll_at'`).get() as
      | { value: string }
      | undefined
  )?.value;
  const lastPollError =
    (
      db.prepare(`SELECT value FROM poller_meta WHERE key = 'last_poll_error'`).get() as
        | { value: string }
        | undefined
    )?.value ?? null;
  const repos = db
    .prepare(
      `SELECT owner, repo, last_ok_at AS lastOkAt, last_error AS lastError, last_error_at AS lastErrorAt
       FROM sync_state
       ORDER BY owner, repo`,
    )
    .all() as SyncStatus['repos'];

  return {
    configured,
    bootstrapped,
    lastPollAt: lastPollAtRaw ? Number(lastPollAtRaw) : null,
    lastPollError: lastPollError || null,
    repos,
  };
}

export function isActionsRange(value: string): value is ActionsRange {
  return (
    value === '1h' ||
    value === '6h' ||
    value === '24h' ||
    value === '7d' ||
    value === '30d' ||
    value === 'today'
  );
}

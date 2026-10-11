import type Database from 'better-sqlite3';

import type { ActionRunRow } from './map.ts';

const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

export function upsertRun(db: Database.Database, row: ActionRunRow, syncedAt = Date.now()): void {
  db.prepare(
    `INSERT INTO runs (
      owner, repo, run_id, workflow_id, title, status, event, ref, commit_sha,
      run_number, html_url, started_at, stopped_at, duration_ms, created_at, updated_at, synced_at
    ) VALUES (
      @owner, @repo, @runId, @workflowId, @title, @status, @event, @ref, @commitSha,
      @runNumber, @htmlUrl, @startedAt, @stoppedAt, @durationMs, @createdAt, @updatedAt, @syncedAt
    )
    ON CONFLICT(owner, repo, run_id) DO UPDATE SET
      workflow_id = excluded.workflow_id,
      title = excluded.title,
      status = excluded.status,
      event = excluded.event,
      ref = excluded.ref,
      commit_sha = excluded.commit_sha,
      run_number = excluded.run_number,
      html_url = excluded.html_url,
      started_at = excluded.started_at,
      stopped_at = excluded.stopped_at,
      duration_ms = excluded.duration_ms,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      synced_at = excluded.synced_at`,
  ).run({
    owner: row.owner,
    repo: row.repo,
    runId: row.runId,
    workflowId: row.workflowId,
    title: row.title,
    status: row.status,
    event: row.event,
    ref: row.ref,
    commitSha: row.commitSha,
    runNumber: row.runNumber,
    htmlUrl: row.htmlUrl,
    startedAt: row.startedAt,
    stoppedAt: row.stoppedAt,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    syncedAt,
  });
}

export function recordSyncOk(
  db: Database.Database,
  owner: string,
  repo: string,
  at = Date.now(),
): void {
  db.prepare(
    `INSERT INTO sync_state (owner, repo, last_ok_at, last_error, last_error_at)
     VALUES (?, ?, ?, NULL, NULL)
     ON CONFLICT(owner, repo) DO UPDATE SET
       last_ok_at = excluded.last_ok_at,
       last_error = NULL,
       last_error_at = NULL`,
  ).run(owner, repo, at);
}

export function recordSyncError(
  db: Database.Database,
  owner: string,
  repo: string,
  error: string,
  at = Date.now(),
): void {
  db.prepare(
    `INSERT INTO sync_state (owner, repo, last_ok_at, last_error, last_error_at)
     VALUES (?, ?, NULL, ?, ?)
     ON CONFLICT(owner, repo) DO UPDATE SET
       last_error = excluded.last_error,
       last_error_at = excluded.last_error_at`,
  ).run(owner, repo, error.slice(0, 500), at);
}

export function getPollerMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM poller_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setPollerMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO poller_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function pruneOldRuns(db: Database.Database, now = Date.now()): number {
  const cutoff = now - RETENTION_MS;
  const result = db
    .prepare(`DELETE FROM runs WHERE COALESCE(started_at, created_at) < ?`)
    .run(cutoff);
  return result.changes;
}

export function listOpenRuns(
  db: Database.Database,
): Array<{ owner: string; repo: string; runId: number }> {
  return db
    .prepare(
      `SELECT owner, repo, run_id AS runId FROM runs
       WHERE status IN ('waiting', 'running')
       ORDER BY updated_at DESC
       LIMIT 200`,
    )
    .all() as Array<{ owner: string; repo: string; runId: number }>;
}

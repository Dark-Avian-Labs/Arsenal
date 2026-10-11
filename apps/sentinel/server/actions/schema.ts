import type Database from 'better-sqlite3';

export function migrateActionsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      run_id INTEGER NOT NULL,
      workflow_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      event TEXT NOT NULL,
      ref TEXT,
      commit_sha TEXT,
      run_number INTEGER NOT NULL,
      html_url TEXT NOT NULL,
      started_at INTEGER,
      stopped_at INTEGER,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      synced_at INTEGER NOT NULL,
      PRIMARY KEY (owner, repo, run_id)
    );
    CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_workflow ON runs(workflow_id);
    CREATE INDEX IF NOT EXISTS idx_runs_owner_repo ON runs(owner, repo);

    CREATE TABLE IF NOT EXISTS sync_state (
      owner TEXT NOT NULL,
      repo TEXT NOT NULL,
      last_ok_at INTEGER,
      last_error TEXT,
      last_error_at INTEGER,
      PRIMARY KEY (owner, repo)
    );

    CREATE TABLE IF NOT EXISTS poller_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

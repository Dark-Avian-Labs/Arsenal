import type Database from 'better-sqlite3';

import { getWorCatalogDb } from '../../games/wor/index.ts';
import {
  isWorImportLeaseHeld,
  releaseWorImportLease,
  tryAcquireWorImportLease,
} from './importLease.ts';
import {
  runWorStartupPipeline,
  type WorImportLogLine,
  type WorImportSummary,
} from './startupPipeline.ts';
import type { WorPipelineStepKey } from './worPipelineSteps.ts';
import { WOR_PIPELINE_STEPS } from './worPipelineSteps.ts';

export type WorAdminImportLogLine = WorImportLogLine & { id: number };

export type WorAdminImportSnapshot = {
  runId: number;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lines: WorAdminImportLogLine[];
  summary: WorImportSummary | null;
  error: string | null;
};

export type WorAdminImportEvent =
  | { snapshot: WorAdminImportSnapshot }
  | { lines: WorAdminImportLogLine[] };

type SnapshotListener = (event: WorAdminImportEvent) => void;

const MAX_LINES = 2000;
const LINE_NOTIFY_THROTTLE_MS = 250;
const listeners = new Set<SnapshotListener>();
let nextLineId = 1;
let notifiedLineId = 0;
let lineNotifyTimer: ReturnType<typeof setTimeout> | null = null;

let state: WorAdminImportSnapshot = {
  runId: 0,
  running: false,
  startedAt: null,
  finishedAt: null,
  lines: [],
  summary: null,
  error: null,
};

let activeJobPromise: Promise<void> | null = null;
let activeLockToken: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function emit(event: WorAdminImportEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function notify(): void {
  if (lineNotifyTimer) {
    clearTimeout(lineNotifyTimer);
    lineNotifyTimer = null;
  }
  notifiedLineId = nextLineId - 1;
  emit({ snapshot: getWorAdminImportSnapshot() });
}

function notifyNewLines(): void {
  lineNotifyTimer = null;
  const lines = state.lines.filter((line) => line.id > notifiedLineId);
  if (lines.length === 0) return;
  notifiedLineId = lines[lines.length - 1]!.id;
  emit({ lines });
}

function pushLine(level: WorImportLogLine['level'], message: string): void {
  state.lines.push({ id: nextLineId++, ts: nowIso(), level, message });
  if (state.lines.length > MAX_LINES) {
    state.lines.splice(0, state.lines.length - MAX_LINES);
  }
  if (lineNotifyTimer) return;
  lineNotifyTimer = setTimeout(notifyNewLines, LINE_NOTIFY_THROTTLE_MS);
  lineNotifyTimer.unref?.();
}

export function getWorAdminImportSnapshot(): WorAdminImportSnapshot {
  return { ...state, lines: [...state.lines] };
}

export function subscribeWorAdminImport(listener: SnapshotListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function waitForWorImportIdle(timeoutMs: number): Promise<boolean> {
  if (!activeJobPromise) return Promise.resolve(true);
  return Promise.race([
    activeJobPromise.then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs).unref()),
  ]);
}

export function isWorImportRunning(): boolean {
  if (state.running) return true;
  try {
    return isWorImportLeaseHeld(getWorCatalogDb() as Database.Database);
  } catch {
    return false;
  }
}

export function __resetWorAdminImportForTests(): void {
  listeners.clear();
  if (lineNotifyTimer) clearTimeout(lineNotifyTimer);
  lineNotifyTimer = null;
  state = {
    runId: 0,
    running: false,
    startedAt: null,
    finishedAt: null,
    lines: [],
    summary: null,
    error: null,
  };
  activeJobPromise = null;
  activeLockToken = null;
}

function parseForceSteps(forceSteps: string[] | undefined): WorPipelineStepKey[] | undefined {
  if (!forceSteps?.length) return undefined;
  const allowed = new Set<string>(WOR_PIPELINE_STEPS);
  const parsed = forceSteps.filter((step): step is WorPipelineStepKey => allowed.has(step));
  return parsed.length > 0 ? parsed : undefined;
}

export function startWorAdminImport(options?: {
  forceImport?: boolean;
  forceImages?: boolean;
  forceSteps?: string[];
}): { started: boolean; reason?: string; snapshot: WorAdminImportSnapshot } {
  if (state.running || activeJobPromise) {
    return {
      started: false,
      reason: 'Import already running',
      snapshot: getWorAdminImportSnapshot(),
    };
  }

  const db = getWorCatalogDb() as Database.Database;
  if (isWorImportLeaseHeld(db)) {
    return {
      started: false,
      reason: 'Import lease held by another process',
      snapshot: getWorAdminImportSnapshot(),
    };
  }

  const runId = Number(
    db.prepare(`INSERT INTO import_runs (status) VALUES ('running')`).run().lastInsertRowid,
  );
  const lockToken = tryAcquireWorImportLease(db, runId);
  if (!lockToken) {
    db.prepare(
      `UPDATE import_runs SET status = 'failed', finished_at = datetime('now'), error = ? WHERE id = ?`,
    ).run('Failed to acquire import lease', runId);
    return {
      started: false,
      reason: 'Import lease held by another process',
      snapshot: getWorAdminImportSnapshot(),
    };
  }
  activeLockToken = lockToken;

  state = {
    runId,
    running: true,
    startedAt: nowIso(),
    finishedAt: null,
    lines: [],
    summary: null,
    error: null,
  };
  notify();

  activeJobPromise = (async () => {
    try {
      pushLine('info', 'Starting Watcher of Realms catalog import…');
      const summary = await runWorStartupPipeline({
        forceImport: options?.forceImport,
        forceImages: options?.forceImages,
        forceSteps: parseForceSteps(options?.forceSteps),
        onLog: (line) => pushLine(line.level, line.message),
        importLockToken: lockToken,
      });
      state.summary = summary;
      state.finishedAt = nowIso();
      state.running = false;
      db.prepare(
        `UPDATE import_runs SET status = 'succeeded', finished_at = datetime('now'), steps_json = ? WHERE id = ?`,
      ).run(JSON.stringify({ lines: state.lines, summary }), runId);
      pushLine('info', 'Import finished successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.error = message;
      state.finishedAt = nowIso();
      state.running = false;
      db.prepare(
        `UPDATE import_runs SET status = 'failed', finished_at = datetime('now'), error = ?, steps_json = ? WHERE id = ?`,
      ).run(message, JSON.stringify({ lines: state.lines }), runId);
      pushLine('error', message);
    } finally {
      if (activeLockToken) {
        releaseWorImportLease(db, activeLockToken);
        activeLockToken = null;
      }
      activeJobPromise = null;
      notify();
    }
  })();

  return { started: true, snapshot: getWorAdminImportSnapshot() };
}

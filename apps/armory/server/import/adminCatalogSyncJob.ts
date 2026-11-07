import { fork } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { log } from '@dark-avian-labs/server-kit';

import { bustCatalogResponseCache } from '../cache/catalogResponseCache.ts';
import { bustModListCache } from '../cache/modListCache.ts';
import type { CatalogSyncSummary } from './codexCatalog.ts';

const RUN_CATALOG_SYNC_PATH = fileURLToPath(new URL('./runCatalogSync.ts', import.meta.url));

export interface SyncLogLine {
  ts: string;
  level: 'info' | 'error';
  message: string;
}

export interface AdminCatalogSyncSnapshot {
  runId: number;
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  requestedByUserId: string | null;
  requestedByUserMasked: string | null;
  lines: SyncLogLine[];
  summary: CatalogSyncSummary | null;
  error: string | null;
}

type SnapshotListener = (snapshot: AdminCatalogSyncSnapshot) => void;

const MAX_LINES = 4000;
const listeners = new Set<SnapshotListener>();

let runCounter = 0;

let state: AdminCatalogSyncSnapshot = {
  runId: 0,
  running: false,
  startedAt: null,
  finishedAt: null,
  requestedByUserId: null,
  requestedByUserMasked: null,
  lines: [],
  summary: null,
  error: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

function maskClerkUserId(userId: string | null): string | null {
  if (!userId) return null;
  if (userId.length <= 8) return userId;
  return `${userId.slice(0, 4)}…${userId.slice(-4)}`;
}

function pushLine(level: 'info' | 'error', message: string): void {
  const line: SyncLogLine = { ts: nowIso(), level, message };
  state.lines.push(line);
  if (state.lines.length > MAX_LINES) {
    state.lines.splice(0, state.lines.length - MAX_LINES);
  }
  notify();
}

function notify(): void {
  const snapshot = getAdminCatalogSyncSnapshot();
  let index = 0;
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      log('error', 'Admin catalog sync snapshot listener failed', {
        index,
        err: error instanceof Error ? error.message : String(error),
      });
    }
    index += 1;
  }
}

export function getAdminCatalogSyncSnapshot(): AdminCatalogSyncSnapshot {
  return {
    ...state,
    lines: [...state.lines],
  };
}

export function subscribeAdminCatalogSyncSnapshot(listener: SnapshotListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isAdminCatalogSyncRunning(): boolean {
  return state.running;
}

export function waitForAdminCatalogSyncIdle(timeoutMs: number): Promise<boolean> {
  if (!isAdminCatalogSyncRunning()) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const unsubscribe = subscribeAdminCatalogSyncSnapshot(() => {
      if (!isAdminCatalogSyncRunning()) {
        finish(true);
      }
    });
  });
}

export function startAdminCatalogSyncJob(requestedByUserId: string | null = null): {
  started: boolean;
  snapshot: AdminCatalogSyncSnapshot;
  reason?: string;
} {
  if (isAdminCatalogSyncRunning()) {
    return {
      started: false,
      reason: 'A catalog sync job is already running.',
      snapshot: getAdminCatalogSyncSnapshot(),
    };
  }

  runCounter += 1;
  const masked = maskClerkUserId(requestedByUserId);
  state = {
    runId: runCounter,
    running: true,
    startedAt: nowIso(),
    finishedAt: null,
    requestedByUserId,
    requestedByUserMasked: masked,
    lines: [],
    summary: null,
    error: null,
  };
  pushLine(
    'info',
    `[CatalogSync] Run #${state.runId} queued${masked ? ` by user ${masked}` : ''}.`,
  );

  const finish = (failure: string | null) => {
    if (!state.running) return;
    const summary = state.summary;
    if (failure === null && summary) {
      const tableTotal = Object.values(summary.tables).reduce((sum, n) => sum + n, 0);
      pushLine(
        'info',
        `[CatalogSync] Run #${state.runId} finished: ${tableTotal} catalog rows, ${summary.imagesCopied} images copied.`,
      );
    } else {
      state.error = failure ?? 'Sync process exited without a summary.';
      pushLine('error', `[CatalogSync] Run #${state.runId} failed: ${state.error}`);
    }
    state.running = false;
    state.finishedAt = nowIso();
    bustModListCache();
    bustCatalogResponseCache();
    notify();
  };

  // The sync is one long SQLite transaction plus a recursive image copy; it runs in its own
  // process so the API event loop stays responsive.
  const child = fork(RUN_CATALOG_SYNC_PATH, [], { execArgv: [], silent: true });
  if (child.stdout) {
    createInterface({ input: child.stdout }).on('line', (line) => {
      pushLine(line.startsWith('[CatalogSync:error]') ? 'error' : 'info', line);
    });
  }
  if (child.stderr) {
    createInterface({ input: child.stderr }).on('line', (line) => pushLine('error', line));
  }
  child.on('message', (summary) => {
    state.summary = summary as CatalogSyncSummary;
  });
  child.on('error', (error) => finish(error.message));
  child.on('close', (code, signal) =>
    finish(code === 0 ? null : `Sync process exited with ${signal ?? `code ${code}`}.`),
  );

  return { started: true, snapshot: getAdminCatalogSyncSnapshot() };
}

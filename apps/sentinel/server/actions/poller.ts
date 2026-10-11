import { log } from '@dark-avian-labs/server-kit';

import { FORGEJO_OWNERS } from '../config.ts';
import {
  ForgejoApiError,
  getActionRun,
  isForgejoConfigured,
  listActionRuns,
  listReposForOwner,
} from './client.ts';
import { getActionsDb } from './db.ts';
import { mapForgejoRun } from './map.ts';
import {
  getPollerMeta,
  listOpenRuns,
  pruneOldRuns,
  recordSyncError,
  recordSyncOk,
  setPollerMeta,
  upsertRun,
} from './writer.ts';

const POLL_INTERVAL_MS = 60_000;
const PAGE_LIMIT = 50;
const BOOTSTRAP_MAX_PAGES = 20;
const BOOTSTRAP_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function syncRepo(
  owner: string,
  repo: string,
  options: { bootstrap: boolean },
): Promise<void> {
  const db = getActionsDb();
  const since = Date.now() - BOOTSTRAP_LOOKBACK_MS;
  const maxPages = options.bootstrap ? BOOTSTRAP_MAX_PAGES : 1;

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const { runs } = await listActionRuns(owner, repo, { page, limit: PAGE_LIMIT });
      if (runs.length === 0) break;

      let oldestStarted = Number.POSITIVE_INFINITY;
      for (const payload of runs) {
        const row = mapForgejoRun(payload, owner, repo);
        upsertRun(db, row);
        const ts = row.startedAt ?? row.createdAt;
        if (ts < oldestStarted) oldestStarted = ts;
      }

      if (!options.bootstrap) break;
      if (runs.length < PAGE_LIMIT) break;
      if (oldestStarted < since) break;
    }
    recordSyncOk(db, owner, repo);
  } catch (err) {
    const message =
      err instanceof ForgejoApiError
        ? `HTTP ${err.status}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    recordSyncError(db, owner, repo, message);
    log('warn', 'actions_repo_sync_failed', { owner, repo, error: message });
  }
}

async function refreshOpenRuns(): Promise<void> {
  const db = getActionsDb();
  const open = listOpenRuns(db);
  for (const item of open) {
    try {
      const payload = await getActionRun(item.owner, item.repo, item.runId);
      upsertRun(db, mapForgejoRun(payload, item.owner, item.repo));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('warn', 'actions_open_run_refresh_failed', {
        owner: item.owner,
        repo: item.repo,
        runId: item.runId,
        error: message,
      });
    }
  }
}

export async function pollActionsOnce(): Promise<void> {
  if (!isForgejoConfigured()) return;
  if (running) return;
  running = true;
  const db = getActionsDb();
  try {
    const bootstrapped = getPollerMeta(db, 'bootstrapped') === '1';
    for (const owner of FORGEJO_OWNERS) {
      let repos;
      try {
        repos = await listReposForOwner(owner);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setPollerMeta(db, 'last_poll_error', message.slice(0, 500));
        log('warn', 'actions_owner_list_failed', { owner, error: message });
        continue;
      }

      for (const repo of repos) {
        if (repo.archived || !repo.hasActions) continue;
        await syncRepo(repo.owner, repo.name, { bootstrap: !bootstrapped });
      }
    }

    if (bootstrapped) {
      await refreshOpenRuns();
    }

    pruneOldRuns(db);
    setPollerMeta(db, 'bootstrapped', '1');
    setPollerMeta(db, 'last_poll_at', String(Date.now()));
    setPollerMeta(db, 'last_poll_error', '');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setPollerMeta(db, 'last_poll_error', message.slice(0, 500));
    log('warn', 'actions_poll_failed', { error: message });
  } finally {
    running = false;
  }
}

export function startActionsPoller(): { stop: () => void } {
  if (!isForgejoConfigured()) {
    log('info', 'actions_poller_disabled', { reason: 'FORGEJO_TOKEN empty' });
    return {
      stop() {
        /* noop */
      },
    };
  }

  void pollActionsOnce();
  timer = setInterval(() => {
    void pollActionsOnce();
  }, POLL_INTERVAL_MS);

  return {
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

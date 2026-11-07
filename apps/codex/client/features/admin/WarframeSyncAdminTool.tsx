import { apiFetch } from '@dark-avian-labs/ui';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { WarframeSyncResult as SyncResult } from '../../../shared/warframeTypes.js';

type WarframeSyncAdminToolProps = {
  onSyncComplete?: (result: SyncResult) => void | Promise<void>;
};

type SyncRunStatus = {
  id?: number;
  status?: string;
  summary?: SyncResult | null;
  error?: string | null;
};

async function waitForSyncRun(pollUrl: string, signal: AbortSignal): Promise<SyncResult> {
  const deadline = Date.now() + 30 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const pollRes = await apiFetch(pollUrl, { signal });
    const pollBody = (await pollRes.json().catch(() => null)) as SyncRunStatus | null;
    if (!pollRes.ok || !pollBody) throw new Error('Failed to poll sync status');
    if (pollBody.status === 'failed') throw new Error(pollBody.error || 'Sync failed');
    if (pollBody.status === 'succeeded' && pollBody.summary) return pollBody.summary;
  }
  throw new Error('Sync timed out while waiting for completion');
}

export function WarframeSyncAdminTool({ onSyncComplete }: WarframeSyncAdminToolProps) {
  const [runningSync, setRunningSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReport, setLastReport] = useState<SyncResult | null>(null);
  const mountedRef = useRef(true);
  const syncAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      syncAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch('/api/warframe/admin/sync/runs/latest', {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const run = (await response.json().catch(() => null)) as SyncRunStatus | null;
        if (run?.status === 'succeeded' && run.summary) {
          setLastReport(run.summary);
          return;
        }
        if (typeof run?.id !== 'number' || (run.status !== 'pending' && run.status !== 'running')) {
          return;
        }
        setRunningSync(true);
        const result = await waitForSyncRun(
          `/api/warframe/admin/sync/runs/${run.id}`,
          controller.signal,
        );
        setLastReport(result);
        await onSyncComplete?.(result);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to run sync');
      } finally {
        if (!controller.signal.aborted) setRunningSync(false);
      }
    })();
    return () => controller.abort();
  }, []);

  const handleSync = useCallback(async (): Promise<void> => {
    syncAbortRef.current?.abort();
    const controller = new AbortController();
    syncAbortRef.current = controller;
    setRunningSync(true);
    setError(null);
    try {
      const response = await apiFetch('/api/warframe/admin/sync-source', {
        method: 'POST',
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => null)) as
        | SyncResult
        | { error?: string; runId?: number; pollUrl?: string }
        | null;
      if (!response.ok || (body && 'error' in body && body.error)) {
        throw new Error((body && 'error' in body && body.error) || 'Failed to run sync');
      }

      let result: SyncResult | null = null;
      if (response.status === 202 && body && 'runId' in body && typeof body.runId === 'number') {
        const pollUrl =
          typeof body.pollUrl === 'string'
            ? body.pollUrl
            : `/api/warframe/admin/sync/runs/${body.runId}`;
        result = await waitForSyncRun(pollUrl, controller.signal);
      } else {
        result = body as SyncResult;
      }

      if (controller.signal.aborted || !mountedRef.current) return;
      setLastReport(result);
      await onSyncComplete?.(result);
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to run sync');
    } finally {
      if (mountedRef.current && !controller.signal.aborted) {
        setRunningSync(false);
      }
    }
  }, [onSyncComplete]);

  return (
    <div className="glass-surface space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Sync worksheets from catalog</h2>
          <p className="text-muted mt-1 text-sm">
            Reconcile Warframe worksheet rows and market links against warframe-catalog.db (after a
            catalog import).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-accent"
          onClick={() => void handleSync()}
          disabled={runningSync}
        >
          {runningSync ? 'Syncing…' : 'Run sync'}
        </button>
      </div>
      {error ? (
        <p className="text-danger text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {lastReport ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Added</dt>
          <dd className="font-mono tabular-nums">{lastReport.summary.added}</dd>
          <dt className="text-muted">Deleted</dt>
          <dd className="font-mono tabular-nums">{lastReport.summary.deleted}</dd>
          <dt className="text-muted">Unavailable</dt>
          <dd className="font-mono tabular-nums">{lastReport.summary.markedUnavailable}</dd>
          <dt className="text-muted">Mismatched</dt>
          <dd className="font-mono tabular-nums">{lastReport.summary.mismatched}</dd>
        </dl>
      ) : (
        <p className="text-muted text-sm">No sync has been run this session yet.</p>
      )}
    </div>
  );
}

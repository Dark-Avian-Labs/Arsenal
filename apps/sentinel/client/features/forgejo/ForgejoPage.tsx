import { apiFetch, SelectDropdown, useAuth } from '@dark-avian-labs/ui';
import { useEffect, useMemo, useState } from 'react';

import { SentinelTabs } from '../shell/SentinelTabs';
import { ActionsChart, type ChartPoint } from './ActionsChart';

type RangeId = '1h' | '6h' | '24h' | '7d' | '30d' | 'today';

type RunRow = {
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

type Summary = {
  runCount: number;
  successCount: number;
  failureCount: number;
  failurePercent: number | null;
  medianDurationMs: number | null;
  p95DurationMs: number | null;
  repos: Array<{
    owner: string;
    repo: string;
    failedCount: number;
    lastFailureAt: number | null;
    lastCommitSha: string | null;
    lastHtmlUrl: string | null;
  }>;
};

type SyncStatus = {
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

const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'today', label: 'Today' },
];

const STATUSES = [
  'any',
  'failure',
  'success',
  'running',
  'waiting',
  'cancelled',
  'skipped',
  'blocked',
] as const;

const STATUS_OPTIONS = STATUSES.map((value) => ({
  value,
  label: value === 'any' ? 'Any status' : value,
}));

function formatDuration(ms: number | null, startedAt: number | null, status: string): string {
  if (ms != null && Number.isFinite(ms)) {
    return formatMs(ms);
  }
  if ((status === 'running' || status === 'waiting') && startedAt != null) {
    return formatMs(Date.now() - startedAt);
  }
  return '-';
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function shortSha(sha: string | null): string {
  if (!sha) return '-';
  return sha.slice(0, 7);
}

function statusClass(status: string): string {
  if (status === 'success') return 'text-[var(--color-success)]';
  if (status === 'failure') return 'text-[var(--color-danger)]';
  if (status === 'running' || status === 'waiting') return 'text-[var(--color-warning)]';
  return 'text-muted';
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <section className="glass-surface p-4">
      <p className="text-muted text-xs tracking-wide uppercase">{label}</p>
      <p className="text-foreground mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="text-muted mt-1 text-xs">{hint}</p>
    </section>
  );
}

function successRateLabel(summary: Summary | null): string {
  if (!summary) return '-';
  const decided = summary.successCount + summary.failureCount;
  if (decided === 0) return '-';
  return `${((summary.successCount / decided) * 100).toFixed(1)}%`;
}

export function ForgejoPage() {
  const { auth } = useAuth();
  const [workflow, setWorkflow] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('any');
  const [repo, setRepo] = useState('');
  const [range, setRange] = useState<RangeId>('24h');
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [series, setSeries] = useState<ChartPoint[]>([]);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ range });
    if (workflow.trim()) params.set('workflow', workflow.trim());
    if (status !== 'any') params.set('status', status);
    if (repo.trim()) params.set('repo', repo.trim());
    return params.toString();
  }, [workflow, status, repo, range]);

  useEffect(() => {
    if (auth.status !== 'authenticated') return undefined;
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [runsRes, summaryRes, seriesRes, syncRes] = await Promise.all([
          apiFetch(`/api/actions/runs?${query}`),
          apiFetch(`/api/actions/summary?${query}`),
          apiFetch(`/api/actions/series?${query}`),
          apiFetch('/api/actions/sync'),
        ]);
        if (cancelled) return;
        if (
          runsRes.status === 401 ||
          summaryRes.status === 401 ||
          seriesRes.status === 401 ||
          syncRes.status === 401
        ) {
          setError('Sign in to view Forgejo actions.');
          setRuns([]);
          return;
        }
        if (
          runsRes.status === 403 ||
          summaryRes.status === 403 ||
          seriesRes.status === 403 ||
          syncRes.status === 403
        ) {
          setError('Admin access required.');
          setRuns([]);
          return;
        }
        if (!runsRes.ok || !summaryRes.ok || !seriesRes.ok || !syncRes.ok) {
          throw new Error('Actions request failed');
        }
        const runsBody = (await runsRes.json()) as { runs: RunRow[] };
        const summaryBody = (await summaryRes.json()) as { summary: Summary };
        const seriesBody = (await seriesRes.json()) as { points: ChartPoint[] };
        const syncBody = (await syncRes.json()) as SyncStatus;
        if (cancelled) return;
        setError(null);
        setRuns(runsBody.runs);
        setSummary(summaryBody.summary);
        setSeries(seriesBody.points);
        setSync(syncBody);
        setUpdatedAt(Date.now());
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load actions');
        }
      }
    }

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    const onWake = (): void => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [auth.status, query]);

  const syncErrors = sync?.repos.filter((row) => row.lastError) ?? [];

  return (
    <div className="space-y-4">
      <SentinelTabs
        active="forgejo"
        trailing={
          <>
            {updatedAt ? (
              <span className="text-muted ml-4 text-xs">
                Updated {new Date(updatedAt).toLocaleTimeString()}
              </span>
            ) : null}
            <dl className="text-muted ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-sm">
              <div>
                Runs <span className="text-foreground font-medium">{summary?.runCount ?? '-'}</span>
              </div>
              <div>
                Fail{' '}
                <span className="text-foreground font-medium">
                  {summary?.failurePercent == null ? '-' : `${summary.failurePercent.toFixed(0)}%`}
                </span>
              </div>
              <div>
                p50{' '}
                <span className="text-foreground font-medium">
                  {summary?.medianDurationMs == null ? '-' : formatMs(summary.medianDurationMs)}
                </span>
              </div>
              <div>
                p95{' '}
                <span className="text-foreground font-medium">
                  {summary?.p95DurationMs == null ? '-' : formatMs(summary.p95DurationMs)}
                </span>
              </div>
            </dl>
          </>
        }
      />

      <div className="glass-surface flex flex-wrap items-end gap-3 p-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Workflow</span>
          <input
            className="search-box w-full"
            value={workflow}
            onChange={(event) => setWorkflow(event.target.value)}
            placeholder="e.g. dependencies.yml"
          />
        </label>
        <div className="flex min-w-[9rem] flex-col gap-1 text-sm">
          <label htmlFor="forgejo-status" className="text-muted">
            Status
          </label>
          <SelectDropdown
            id="forgejo-status"
            value={status}
            options={STATUS_OPTIONS}
            preserveOrder
            buttonAriaLabel="Status"
            onChange={(value) => setStatus(value as (typeof STATUSES)[number])}
            triggerClassName="user-menu-select-trigger select-dropdown-trigger flex h-10 w-full cursor-pointer items-center justify-between gap-2 text-left text-sm"
          />
        </div>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">Repo</span>
          <input
            className="search-box w-full"
            value={repo}
            onChange={(event) => setRepo(event.target.value)}
            placeholder="Arsenal or Dark-Avian-Labs/Arsenal"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Time range">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={range === item.id ? 'tab active' : 'tab'}
              role="tab"
              aria-selected={range === item.id}
              onClick={() => setRange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="error-msg" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Runs"
          value={summary ? String(summary.runCount) : '-'}
          hint={
            summary
              ? `${summary.successCount} ok · ${summary.failureCount} fail`
              : 'Matching the filters'
          }
        />
        <MetricCard
          label="Success rate"
          value={successRateLabel(summary)}
          hint={
            summary && summary.successCount + summary.failureCount > 0
              ? `${summary.failurePercent?.toFixed(1) ?? '0'}% failure`
              : 'Finished runs only'
          }
        />
        <MetricCard
          label="Median duration"
          value={summary?.medianDurationMs == null ? '-' : formatMs(summary.medianDurationMs)}
          hint="Finished runs in range"
        />
        <MetricCard
          label="p95 duration"
          value={summary?.p95DurationMs == null ? '-' : formatMs(summary.p95DurationMs)}
          hint="Finished runs in range"
        />
      </div>

      <ActionsChart points={series} />

      {sync && !sync.configured ? (
        <p className="text-muted text-sm">
          Forgejo polling is off. Set <code>FORGEJO_TOKEN</code> on the Sentinel server.
        </p>
      ) : null}

      {sync?.lastPollError ? (
        <div className="error-msg" role="alert">
          Last poll error: {sync.lastPollError}
        </div>
      ) : null}

      {syncErrors.length > 0 ? (
        <p className="text-muted text-sm">
          {syncErrors.length} repo{syncErrors.length === 1 ? '' : 's'} failed to sync
          {syncErrors[0] ? ` (e.g. ${syncErrors[0].owner}/${syncErrors[0].repo})` : ''}.
        </p>
      ) : null}

      {summary && workflow.trim() && summary.repos.length > 0 ? (
        <div className="table-container glass-surface">
          <div className="table-scroll">
            <table className="fleet-table">
              <thead>
                <tr>
                  <th scope="col">Repo</th>
                  <th scope="col">Failed</th>
                  <th scope="col">Last failure</th>
                  <th scope="col">SHA</th>
                </tr>
              </thead>
              <tbody>
                {summary.repos.map((row) => (
                  <tr key={`${row.owner}/${row.repo}`}>
                    <td className="text-foreground font-medium">
                      {row.lastHtmlUrl ? (
                        <a
                          href={row.lastHtmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-foreground underline-offset-2 hover:underline"
                        >
                          {row.owner}/{row.repo}
                        </a>
                      ) : (
                        `${row.owner}/${row.repo}`
                      )}
                    </td>
                    <td>{row.failedCount}</td>
                    <td>
                      {row.lastFailureAt == null
                        ? '-'
                        : new Date(row.lastFailureAt).toLocaleString()}
                    </td>
                    <td>
                      <code>{shortSha(row.lastCommitSha)}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {!error && runs === null ? <p className="text-muted text-sm">Loading runs…</p> : null}

      {!error && runs ? (
        <div className="table-container glass-surface">
          <div className="table-scroll">
            <table className="fleet-table" style={{ minWidth: '64rem' }}>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Repo</th>
                  <th scope="col">Workflow</th>
                  <th scope="col">Status</th>
                  <th scope="col">Event</th>
                  <th scope="col">Ref</th>
                  <th scope="col">SHA</th>
                  <th scope="col">Duration</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-muted py-8 text-center text-sm">
                      No runs match these filters.
                    </td>
                  </tr>
                ) : null}
                {runs.map((run) => (
                  <tr key={`${run.owner}/${run.repo}/${run.runId}`}>
                    <td>
                      {run.startedAt == null ? '-' : new Date(run.startedAt).toLocaleString()}
                    </td>
                    <td className="text-foreground font-medium">
                      <a
                        href={run.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground underline-offset-2 hover:underline"
                      >
                        {run.owner}/{run.repo}
                      </a>
                    </td>
                    <td title={run.title}>
                      <span className="block truncate">{run.workflowId}</span>
                    </td>
                    <td className={statusClass(run.status)}>{run.status}</td>
                    <td>{run.event || '-'}</td>
                    <td className="truncate">{run.ref || '-'}</td>
                    <td>
                      <code>{shortSha(run.commitSha)}</code>
                    </td>
                    <td>{formatDuration(run.durationMs, run.startedAt, run.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

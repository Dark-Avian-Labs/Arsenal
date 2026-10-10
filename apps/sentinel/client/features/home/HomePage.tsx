import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { appDetailPath } from '../../app/paths';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../auth/AuthContext';

type FleetApp = {
  id: string;
  displayName: string;
  cpu: number | null;
  rssMb: number | null;
  lagP95Ms: number | null;
  elu: number | null;
  uptimeSec: number | null;
  status: string | null;
  crashCount24h: number;
  restartCount24h: number;
  reqPerSec1h: number | null;
  errorRate1h: number | null;
  pmxModule: boolean;
};

type HostSnapshot = {
  ts: number;
  load1: number | null;
  load5: number | null;
  memUsedPct: number | null;
};

function formatUptime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return '-';
  const s = Math.floor(sec);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isOnline(status: string | null): boolean {
  return status === 'online';
}

function FleetTable({ apps, emptyMessage }: { apps: FleetApp[]; emptyMessage?: string }) {
  const navigate = useNavigate();

  return (
    <div className="table-container glass-surface">
      <div className="table-scroll">
        <table className="fleet-table">
          <thead>
            <tr>
              <th className="col-status" scope="col" aria-label="Status" />
              <th scope="col">App</th>
              <th scope="col">CPU</th>
              <th scope="col">RSS</th>
              <th scope="col">ELU</th>
              <th scope="col">Uptime</th>
              <th scope="col">RPS</th>
              <th scope="col">Errors</th>
              <th scope="col">Lag p95</th>
              <th scope="col">24h events</th>
            </tr>
          </thead>
          <tbody>
            {apps.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-muted py-8 text-center text-sm">
                  {emptyMessage}
                </td>
              </tr>
            ) : null}
            {apps.map((app) => {
              const online = isOnline(app.status);
              return (
                <tr
                  key={app.id}
                  className="fleet-row"
                  tabIndex={0}
                  role="link"
                  aria-label={`${app.displayName}, ${online ? 'online' : 'offline'}`}
                  onClick={() => navigate(appDetailPath(app.id))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(appDetailPath(app.id));
                    }
                  }}
                >
                  <td className="col-status">
                    <span
                      className={
                        online ? 'fleet-status-dot is-online' : 'fleet-status-dot is-offline'
                      }
                      title={app.status ?? 'unknown'}
                      aria-hidden="true"
                    />
                  </td>
                  <td className="text-foreground font-medium">{app.displayName}</td>
                  <td>{app.cpu == null ? '-' : `${app.cpu.toFixed(1)}%`}</td>
                  <td>{app.rssMb == null ? '-' : `${app.rssMb.toFixed(0)} MB`}</td>
                  <td>{app.elu == null ? '-' : `${(app.elu * 100).toFixed(0)}%`}</td>
                  <td>{formatUptime(app.uptimeSec)}</td>
                  <td>{app.reqPerSec1h == null ? '-' : app.reqPerSec1h.toFixed(2)}</td>
                  <td>
                    {app.errorRate1h == null ? '-' : `${(app.errorRate1h * 100).toFixed(1)}%`}
                  </td>
                  <td>{app.lagP95Ms == null ? '-' : `${app.lagP95Ms.toFixed(1)} ms`}</td>
                  <td>
                    {app.restartCount24h} / {app.crashCount24h}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HomePage() {
  const { auth } = useAuth();
  const [apps, setApps] = useState<FleetApp[] | null>(null);
  const [host, setHost] = useState<HostSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    if (auth.status !== 'authenticated') return undefined;
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await apiFetch('/api/fleet');
        if (cancelled) return;
        if (res.status === 401) {
          setApps([]);
          setError('Sign in to view the fleet.');
          return;
        }
        if (res.status === 403) {
          setApps([]);
          setError('Admin access required.');
          return;
        }
        if (!res.ok) {
          throw new Error(`Fleet request failed (${res.status})`);
        }
        const data = (await res.json()) as { apps: FleetApp[]; host: HostSnapshot | null };
        if (cancelled) return;
        setError(null);
        setApps(data.apps);
        setHost(data.host);
        setUpdatedAt(Date.now());
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load fleet');
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
  }, [auth.status]);

  const appRows = apps?.filter((app) => !app.pmxModule) ?? [];
  const moduleRows = apps?.filter((app) => app.pmxModule) ?? [];

  return (
    <div className="space-y-4">
      <div className="tabs items-center">
        <h1 className="text-foreground px-2 text-sm font-medium">Fleet</h1>
        {updatedAt ? (
          <span className="text-muted text-xs">
            Updated {new Date(updatedAt).toLocaleTimeString()}
          </span>
        ) : null}
        <dl className="text-muted ml-auto flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-sm">
          <div>
            Load{' '}
            <span className="text-foreground font-medium">
              {host?.load1 == null ? '-' : host.load1.toFixed(2)}
            </span>
          </div>
          <div>
            RAM{' '}
            <span className="text-foreground font-medium">
              {host?.memUsedPct == null ? '-' : `${host.memUsedPct.toFixed(0)}%`}
            </span>
          </div>
        </dl>
      </div>

      {error ? (
        <div className="error-msg" role="alert">
          {error}
        </div>
      ) : null}

      {!error && apps === null ? <p className="text-muted text-sm">Loading fleet…</p> : null}

      {!error && apps && apps.length === 0 ? (
        <FleetTable
          apps={[]}
          emptyMessage="No samples yet. Start the PM2 bridge on the server host, or point an in-app agent at /api/ingest."
        />
      ) : null}
      {!error && apps && apps.length > 0 ? (
        <>
          {appRows.length > 0 ? <FleetTable apps={appRows} /> : null}
          {moduleRows.length > 0 ? <FleetTable apps={moduleRows} /> : null}
        </>
      ) : null}
    </div>
  );
}

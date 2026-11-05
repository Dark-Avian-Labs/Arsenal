import { apiFetch, useAuth } from '@dark-avian-labs/ui';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import { appDetailPath } from '../../app/paths';
import { smoothLinePath } from '../forgejo/chartPath';
import { SentinelTabs } from '../shell/SentinelTabs';

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
  hours?: FleetHour[];
  levelMetric?: 'cpu' | 'rss';
};

type FleetHour = {
  level: number | null;
  bad: boolean;
  errorRate: number | null;
};

type GlanceTone = 'empty' | 'low' | 'steady' | 'high' | 'bad';

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

function hourTones(hours: FleetHour[], metric: 'cpu' | 'rss'): GlanceTone[] {
  const low = metric === 'cpu' ? 10 : 128;
  const high = metric === 'cpu' ? 40 : 512;
  return hours.map((hour) => {
    if (hour.bad) return 'bad';
    if (hour.level == null) return 'empty';
    if (hour.level >= high) return 'high';
    if (hour.level >= low) return 'steady';
    return 'low';
  });
}

function ErrorTrace({ rates }: { rates: Array<number | null> }) {
  const width = 160;
  const height = 36;
  const padX = 4;
  const padY = 3;
  const finite = rates.filter((value): value is number => value != null);
  const peak = Math.max(...finite.map((value) => value * 100), 0);
  const scale = Math.max(peak * 1.4, peak > 0 ? peak : 1);
  const denom = Math.max(rates.length - 1, 1);
  const plotted = rates.map((rate, index) => ({
    x: padX + (index / denom) * (width - padX * 2),
    y: height - padY - (((rate ?? 0) * 100) / scale) * (height - padY * 2),
  }));
  const line = smoothLinePath(plotted);
  const first = plotted[0];
  const last = plotted[plotted.length - 1];
  const area =
    first && last && line
      ? `${line} L ${last.x} ${height - padY} L ${first.x} ${height - padY} Z`
      : '';
  if (!area) return null;
  return (
    <svg
      className="process-rail__trace"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={area} fill="var(--color-danger)" opacity="0.35" />
      <path
        d={line}
        fill="none"
        stroke="var(--color-danger)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CommitGraph({ hours, metric }: { hours: FleetHour[]; metric: 'cpu' | 'rss' }) {
  const tones = useMemo(() => hourTones(hours, metric), [hours, metric]);
  return (
    <span className="commit-graph-wrap">
      <span className="commit-graph">
        {hours.map((hour, index) => (
          <span
            key={index}
            className={`commit-graph__cell is-${tones[index]}`}
            title={hour.bad ? 'Errors in this hour' : undefined}
          />
        ))}
      </span>
      <span className="commit-graph__scale">
        <span>24h ago</span>
        <span>now</span>
      </span>
    </span>
  );
}

function metricText(value: number | null, digits: number, suffix: string): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}${suffix}`;
}

function ProcessList({
  apps,
  title,
  emptyMessage,
}: {
  apps: FleetApp[];
  title?: string;
  emptyMessage?: string;
}) {
  const navigate = useNavigate();

  return (
    <section className="space-y-2">
      {title ? <h2 className="text-foreground text-sm font-medium">{title}</h2> : null}
      {apps.length === 0 ? <p className="text-muted text-sm">{emptyMessage}</p> : null}
      <ul className="process-list">
        {apps.map((app) => {
          const online = isOnline(app.status);
          return (
            <li key={app.id}>
              <button
                type="button"
                className={`process-rail ${online ? 'is-up' : 'is-down'}`}
                aria-label={`${app.displayName}, ${online ? 'up' : 'down'}`}
                onClick={() => navigate(appDetailPath(app.id))}
              >
                <span className="process-rail__body">
                  <span className="process-rail__top">
                    {app.hours && app.hours.length > 0 ? (
                      <CommitGraph hours={app.hours} metric={app.levelMetric ?? 'cpu'} />
                    ) : null}
                    <span className="process-rail__id">
                      <span className="process-rail__name">{app.displayName}</span>
                      <span className="process-rail__meta">
                        <span className={online ? 'is-up' : 'is-down'}>
                          {online ? 'Up' : 'Down'}
                        </span>
                        <span>{formatUptime(app.uptimeSec)}</span>
                      </span>
                    </span>
                    <span className="process-rail__metrics">
                      <span>
                        <span className="process-rail__value">{metricText(app.cpu, 1, '%')}</span>
                        <span className="process-rail__label">CPU</span>
                      </span>
                      <span>
                        <span className="process-rail__value">
                          {app.rssMb == null ? '-' : `${app.rssMb.toFixed(0)}`}
                        </span>
                        <span className="process-rail__label">MB</span>
                      </span>
                      <span>
                        <span className="process-rail__value">
                          {app.lagP95Ms == null ? '-' : app.lagP95Ms.toFixed(1)}
                        </span>
                        <span className="process-rail__label">ms lag</span>
                      </span>
                    </span>
                    <span className="process-rail__aside">
                      <span>{app.elu == null ? '-' : `${(app.elu * 100).toFixed(0)}% loop`}</span>
                      <span>
                        {app.reqPerSec1h == null ? '-' : `${app.reqPerSec1h.toFixed(2)} req/s`}
                      </span>
                      <span>
                        {app.errorRate1h == null
                          ? '-'
                          : `${(app.errorRate1h * 100).toFixed(1)}% 5xx`}
                      </span>
                      <span>
                        {app.restartCount24h} restarts, {app.crashCount24h} crashes
                      </span>
                    </span>
                  </span>
                </span>
                <span className="process-rail__chart">
                  <span className="process-rail__chart-label">5xx</span>
                  {app.hours && app.hours.some((hour) => hour.errorRate != null) ? (
                    <ErrorTrace rates={app.hours.map((hour) => hour.errorRate)} />
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
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
      <SentinelTabs
        active="fleet"
        trailing={
          <>
            {updatedAt ? (
              <span className="text-muted ml-auto text-xs">
                Updated {new Date(updatedAt).toLocaleTimeString()}
              </span>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="error-msg" role="alert">
          {error}
        </div>
      ) : null}

      {host ? (
        <section className="host-readout">
          <div>
            <p className="text-muted text-sm">Load</p>
            <p className="host-readout__value">
              {host.load1 == null ? '-' : host.load1.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-muted text-sm">Memory</p>
            <p className="host-readout__value">
              {host.memUsedPct == null ? '-' : `${host.memUsedPct.toFixed(0)}%`}
            </p>
          </div>
        </section>
      ) : null}

      {!error && apps === null ? <p className="text-muted text-sm">Loading fleet…</p> : null}

      {!error && apps && apps.length === 0 ? (
        <ProcessList
          apps={[]}
          emptyMessage="No samples yet. Start the PM2 bridge on the server host, or point an in-app agent at /api/ingest."
        />
      ) : null}
      {!error && apps && apps.length > 0 ? (
        <>
          {appRows.length > 0 ? (
            <ProcessList apps={appRows} title={moduleRows.length > 0 ? 'Apps' : undefined} />
          ) : null}
          {moduleRows.length > 0 ? <ProcessList apps={moduleRows} title="Host" /> : null}
        </>
      ) : null}
    </div>
  );
}

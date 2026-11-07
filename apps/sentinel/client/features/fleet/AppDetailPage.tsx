import { apiFetch, useAuth } from '@dark-avian-labs/ui';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

import { SentinelTabs } from '../shell/SentinelTabs';
import { MetricSparkline } from './MetricSparkline';

const RANGES = [
  { id: '1h', label: '1h' },
  { id: '6h', label: '6h' },
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: 'today', label: 'Today' },
] as const;

type DetailPayload = {
  app: { id: string; displayName: string; pm2Name: string | null };
  range: string;
  from: number;
  to: number;
  bucketMs: number;
  points: Array<{
    ts: number;
    cpu: number | null;
    rssMb: number | null;
    heapMb: number | null;
    heapTotalMb: number | null;
    heapExternalMb: number | null;
    lagP95Ms: number | null;
    elu: number | null;
    gcP95Ms: number | null;
  }>;
  http: Array<{
    ts: number;
    count: number;
    latencyP95Ms: number | null;
    reqPerSec: number | null;
    errorRate: number | null;
  }>;
  events: Array<{
    id: number;
    ts: number;
    kind: string;
    exitCode: number | null;
    signal: string | null;
    message: string | null;
    source: string;
  }>;
};

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString();
}

type ChartPoint = { ts: number; value: number | null };

function hasSeries(points: ChartPoint[]): boolean {
  return points.some((point) => point.value != null && Number.isFinite(point.value));
}

function ChartStrip({
  data,
  charts,
}: {
  data: DetailPayload;
  charts: Array<{ title: string; unit: string; points: ChartPoint[]; colorVar?: string }>;
}) {
  const visible = charts.filter((chart) => hasSeries(chart.points));
  if (visible.length === 0) return null;
  return (
    <div className="metric-strip">
      {visible.map((chart) => (
        <MetricSparkline
          key={chart.title}
          title={chart.title}
          unit={chart.unit}
          points={chart.points}
          from={data.from}
          to={data.to}
          bucketMs={data.bucketMs}
          colorVar={chart.colorVar}
        />
      ))}
    </div>
  );
}

type RangeTone = 'empty' | 'low' | 'steady' | 'high' | 'bad';

function RangeMap({ data }: { data: DetailPayload }) {
  const cells = useMemo(() => {
    const useCpu = data.points.some((point) => point.cpu != null);
    const samples = data.points.filter((point) => (useCpu ? point.cpu : point.rssMb) != null);
    if (samples.length === 0) return [];
    const start = data.points[0]!.ts;
    const end = data.points[data.points.length - 1]!.ts;
    const count = Math.min(36, Math.max(12, Math.round(samples.length / 2)));
    const span = Math.max(end - start, 1);
    const bucket = span / count;
    const draft = Array.from({ length: count }, (_, index) => {
      const from = start + index * bucket;
      const to = index === count - 1 ? end + 1 : from + bucket;
      const cpus = data.points
        .filter((point) => point.ts >= from && point.ts < to)
        .map((point) => (useCpu ? point.cpu : point.rssMb))
        .filter((value): value is number => value != null);
      const bad =
        data.http.some(
          (point) => point.ts >= from && point.ts < to && (point.errorRate ?? 0) > 0,
        ) ||
        data.events.some(
          (event) =>
            event.ts >= from && event.ts < to && event.kind.toLowerCase().includes('crash'),
        );
      const cpu = cpus.length ? cpus.reduce((sum, value) => sum + value, 0) / cpus.length : null;
      return { from, cpu, bad };
    });
    const low = useCpu ? 10 : 128;
    const high = useCpu ? 40 : 512;
    return draft.map((cell) => {
      let tone: RangeTone = 'empty';
      if (cell.bad) tone = 'bad';
      else if (cell.cpu == null) tone = 'empty';
      else if (cell.cpu >= high) tone = 'high';
      else if (cell.cpu >= low) tone = 'steady';
      else tone = 'low';
      const when = new Date(cell.from).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const label = useCpu ? 'CPU' : 'Memory';
      const unit = useCpu ? '%' : ' MB';
      const title =
        cell.cpu == null
          ? when
          : `${when}, ${label} ${cell.cpu.toFixed(1)}${unit}${cell.bad ? ', errors' : ''}`;
      return { from: cell.from, tone, title };
    });
  }, [data]);

  if (cells.length === 0) return null;
  const start = new Date(data.points[0]!.ts);
  const end = new Date(data.points[data.points.length - 1]!.ts);
  const time = (date: Date) =>
    date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="range-map">
      <div className="range-map__cells" role="img" aria-label="Usage and errors across this range">
        {cells.map((cell) => (
          <span key={cell.from} className={`range-map__cell is-${cell.tone}`} title={cell.title} />
        ))}
      </div>
      <div className="range-map__scale">
        <span>{time(start)}</span>
        <span>{time(end)}</span>
      </div>
    </div>
  );
}

export function AppDetailPage() {
  const { appId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const range = searchParams.get('range') || '24h';
  const { auth } = useAuth();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== 'authenticated' || !appId) return undefined;
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const res = await apiFetch(
          `/api/fleet/${encodeURIComponent(appId)}?range=${encodeURIComponent(range)}`,
        );
        if (cancelled) return;
        if (res.status === 401) {
          setError('Sign in to view this app.');
          return;
        }
        if (res.status === 403) {
          setError('Admin access required.');
          return;
        }
        if (res.status === 404) {
          setError('App not found.');
          return;
        }
        if (!res.ok) throw new Error(`Detail request failed (${res.status})`);
        const payload = (await res.json()) as DetailPayload;
        if (cancelled) return;
        setError(null);
        setData(payload);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load app');
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
  }, [appId, range, auth.status]);

  return (
    <div className="space-y-4">
      <SentinelTabs
        active="app"
        appLabel={data?.app.displayName ?? appId}
        trailing={
          <div
            className="ml-auto flex min-w-0 flex-wrap justify-end gap-1"
            role="tablist"
            aria-label="Time range"
          >
            {RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={range === item.id ? 'tab active' : 'tab'}
                role="tab"
                aria-selected={range === item.id}
                onClick={() => setSearchParams({ range: item.id })}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <div className="error-msg" role="alert">
          {error}
        </div>
      ) : null}
      {!error && !data ? <p className="text-muted text-sm">Loading…</p> : null}

      {data ? (
        <>
          <RangeMap data={data} />
          {hasSeries(data.points.map((p) => ({ ts: p.ts, value: p.cpu }))) ? (
            <MetricSparkline
              variant="hero"
              title="CPU"
              unit="%"
              points={data.points.map((p) => ({ ts: p.ts, value: p.cpu }))}
              from={data.from}
              to={data.to}
              bucketMs={data.bucketMs}
            />
          ) : null}
          <ChartStrip
            data={data}
            charts={[
              {
                title: 'Memory',
                unit: 'MB',
                points: data.points.map((p) => ({ ts: p.ts, value: p.rssMb })),
              },
              {
                title: 'Event loop lag p95',
                unit: 'ms',
                points: data.points.map((p) => ({ ts: p.ts, value: p.lagP95Ms })),
              },
              {
                title: 'Request rate',
                unit: 'req/s',
                points: data.http.map((p) => ({ ts: p.ts, value: p.reqPerSec })),
              },
              {
                title: 'Error rate',
                unit: '%',
                colorVar: 'var(--color-danger)',
                points: data.http.map((p) => ({
                  ts: p.ts,
                  value: p.errorRate == null ? null : p.errorRate * 100,
                })),
              },
              {
                title: 'HTTP latency p95',
                unit: 'ms',
                points: data.http.map((p) => ({ ts: p.ts, value: p.latencyP95Ms })),
              },
            ]}
          />

          <section className="space-y-3">
            <h2 className="text-foreground text-lg font-semibold">Process</h2>
            <ChartStrip
              data={data}
              charts={[
                {
                  title: 'Heap used',
                  unit: 'MB',
                  points: data.points.map((p) => ({ ts: p.ts, value: p.heapMb })),
                },
                {
                  title: 'Heap total',
                  unit: 'MB',
                  points: data.points.map((p) => ({ ts: p.ts, value: p.heapTotalMb })),
                },
                {
                  title: 'Heap external',
                  unit: 'MB',
                  points: data.points.map((p) => ({ ts: p.ts, value: p.heapExternalMb })),
                },
                {
                  title: 'Event loop utilization',
                  unit: '%',
                  points: data.points.map((p) => ({
                    ts: p.ts,
                    value: p.elu == null ? null : p.elu * 100,
                  })),
                },
                {
                  title: 'GC pause p95',
                  unit: 'ms',
                  points: data.points.map((p) => ({ ts: p.ts, value: p.gcP95Ms })),
                },
              ]}
            />
          </section>

          <section>
            <h2 className="text-foreground text-lg font-semibold">Events</h2>
            {data.events.length === 0 ? (
              <p className="text-muted mt-3 text-sm">No events in range.</p>
            ) : (
              <ul className="event-log">
                {data.events.map((event) => {
                  const crash = event.kind.toLowerCase().includes('crash');
                  return (
                    <li key={event.id}>
                      <time dateTime={new Date(event.ts).toISOString()}>{formatTs(event.ts)}</time>
                      <span>
                        <span className={crash ? 'text-danger font-medium' : 'font-medium'}>
                          {event.kind}
                          {event.signal ? ` (${event.signal})` : ''}
                          {event.exitCode != null ? ` exit ${event.exitCode}` : ''}
                        </span>
                        {event.message ? (
                          <p className="text-muted text-xs">{event.message}</p>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

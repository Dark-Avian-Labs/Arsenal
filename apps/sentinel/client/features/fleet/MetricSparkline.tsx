import { useId, useMemo, useState } from 'react';

import { smoothLinePath, smoothLineY } from '../forgejo/chartPath';

type Point = { ts: number; value: number | null };

type SparklineProps = {
  title: string;
  unit: string;
  points: Point[];
  from: number;
  to: number;
  bucketMs: number;
  colorVar?: string;
  variant?: 'hero' | 'strip';
};

type Plotted = { ts: number; value: number; x: number; y: number; segment: number };

type Hover = { index: number; x: number };

function formatHoverTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function axisLabel(ts: number, span: number): string {
  const date = new Date(ts);
  if (span > 2 * 86_400_000) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function MetricSparkline({
  title,
  unit,
  points,
  from,
  to,
  bucketMs,
  colorVar = 'var(--color-accent)',
  variant = 'strip',
}: SparklineProps) {
  const width = 560;
  const height = 180;
  const top = variant === 'hero' ? 78 : 64;
  const fillId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<Hover | null>(null);

  const { plotted, segments, linePath, areaPath, ticks } = useMemo(() => {
    const values = points
      .map((p) => p.value)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const maxVal = values.length ? Math.max(...values) : 0;
    const peak = Math.max(maxVal * 1.4, maxVal > 0 ? maxVal : 1);
    const span = Math.max(to - from, 1);
    const next: Plotted[] = [];
    const runs: Plotted[][] = [];
    for (const point of points) {
      if (point.value == null || !Number.isFinite(point.value)) continue;
      const prev = next[next.length - 1];
      if (!prev || point.ts - prev.ts > 2 * bucketMs) runs.push([]);
      const plottedPoint = {
        ts: point.ts,
        value: point.value,
        x: ((point.ts - from) / span) * width,
        y: height - (point.value / peak) * (height - top),
        segment: runs.length - 1,
      };
      next.push(plottedPoint);
      runs[runs.length - 1]!.push(plottedPoint);
    }

    let line = '';
    let area = '';
    if (next.length === 1) {
      const y = next[0]!.y;
      line = `M 0 ${y} L ${width} ${y}`;
      area = `${line} L ${width} ${height} L 0 ${height} Z`;
    } else {
      for (const run of runs) {
        const first = run[0]!;
        const last = run[run.length - 1]!;
        // A zero-length subpath draws a dot through the round line cap.
        const runLine = run.length === 1 ? `M ${first.x} ${first.y} h 0` : smoothLinePath(run);
        line += ` ${runLine}`;
        if (run.length > 1) area += ` ${runLine} L ${last.x} ${height} L ${first.x} ${height} Z`;
      }
    }

    return {
      plotted: next,
      segments: runs,
      linePath: line.trim(),
      areaPath: area.trim(),
      ticks:
        variant === 'hero' && next.length > 1
          ? [from, (from + to) / 2, to].map((ts) => ({
              x: ((ts - from) / span) * width,
              label: axisLabel(ts, span),
            }))
          : [],
    };
  }, [points, from, to, bucketMs, top, variant]);

  const latest = plotted.length ? plotted[plotted.length - 1].value : null;
  const sample = hover != null ? plotted[hover.index] : null;
  const headerValue = sample?.value ?? latest;
  const markerY =
    hover != null && sample ? smoothLineY(segments[sample.segment] ?? [], hover.x) : null;

  function pointerAt(clientX: number, svg: SVGSVGElement): Hover | null {
    if (plotted.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const raw = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Math.abs(plotted[0]!.x - raw);
    for (let i = 1; i < plotted.length; i++) {
      const dist = Math.abs(plotted[i]!.x - raw);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    const run = segments[plotted[best]!.segment]!;
    const x = Math.min(run[run.length - 1]!.x, Math.max(run[0]!.x, raw));
    return { index: best, x };
  }

  return (
    <section className={`metric-chart metric-chart--${variant}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="metric-chart__plot"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title} chart`}
        onMouseMove={(event) => {
          setHover(pointerAt(event.clientX, event.currentTarget));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorVar} stopOpacity="0.55" />
            <stop offset="100%" stopColor={colorVar} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.35, 0.68].map((step) => {
          const y = top + (height - top) * step;
          return (
            <line
              key={step}
              x1="0"
              x2={width}
              y1={y}
              y2={y}
              stroke="var(--color-foreground)"
              strokeOpacity="0.08"
            />
          );
        })}
        {areaPath ? <path d={areaPath} fill={`url(#${fillId})`} stroke="none" /> : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={colorVar}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {hover && markerY != null ? (
          <line
            x1={hover.x}
            y1={top}
            x2={hover.x}
            y2={height}
            stroke="var(--color-foreground)"
            strokeOpacity="0.35"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {!linePath ? <p className="metric-chart__empty">No data in range</p> : null}
      {ticks.length > 0 ? (
        <div className="metric-chart__axis">
          {ticks.map((tick) => (
            <span key={`${tick.x}-${tick.label}`}>{tick.label}</span>
          ))}
        </div>
      ) : null}
      {hover && markerY != null ? (
        <span
          className="metric-chart__marker"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${(markerY / height) * 100}%`,
            background: colorVar,
          }}
        />
      ) : null}
      <div className="metric-chart__head">
        <h3 className="text-muted text-sm font-medium">{title}</h3>
        <p className="metric-chart__value">
          {headerValue == null ? '-' : headerValue.toFixed(1)}
          <span className="metric-chart__unit">{unit}</span>
          {sample ? <span className="metric-chart__when">{formatHoverTime(sample.ts)}</span> : null}
        </p>
      </div>
    </section>
  );
}

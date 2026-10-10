import { useMemo, useState } from 'react';

type Point = { ts: number; value: number | null };

type SparklineProps = {
  title: string;
  unit: string;
  points: Point[];
  colorVar?: string;
};

type Plotted = { index: number; ts: number; value: number; x: number; y: number };

function formatHoverTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MetricSparkline({
  title,
  unit,
  points,
  colorVar = 'var(--color-accent)',
}: SparklineProps) {
  const width = 560;
  const height = 140;
  const pad = 12;
  const [hover, setHover] = useState<Plotted | null>(null);

  const { plotted, linePoints } = useMemo(() => {
    const values = points
      .map((p) => p.value)
      .filter((v): v is number => v != null && Number.isFinite(v));
    const minVal = values.length ? Math.min(...values) : 0;
    const maxVal = values.length ? Math.max(...values) : 1;
    const span = maxVal - minVal || 1;
    const denom = Math.max(points.length - 1, 1);

    const next: Plotted[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (point.value == null || !Number.isFinite(point.value)) continue;
      next.push({
        index: i,
        ts: point.ts,
        value: point.value,
        x: pad + (i / denom) * (width - pad * 2),
        y: height - pad - ((point.value - minVal) / span) * (height - pad * 2),
      });
    }

    return {
      plotted: next,
      linePoints: next.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    };
  }, [points]);

  const latest = plotted.length ? plotted[plotted.length - 1].value : null;
  const headerValue = hover?.value ?? latest;

  function nearestAt(clientX: number, svg: SVGSVGElement): Plotted | null {
    if (plotted.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * width;
    let best = plotted[0];
    let bestDist = Math.abs(best.x - x);
    for (let i = 1; i < plotted.length; i++) {
      const dist = Math.abs(plotted[i].x - x);
      if (dist < bestDist) {
        best = plotted[i];
        bestDist = dist;
      }
    }
    return best;
  }

  return (
    <section className="glass-surface p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        <p className="text-muted text-xs">
          {headerValue == null ? '-' : `${headerValue.toFixed(1)} ${unit}`}
          {hover ? <span className="ml-2 opacity-80">{formatHoverTime(hover.ts)}</span> : null}
        </p>
      </div>
      <div className="relative mt-3">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-36 w-full"
          role="img"
          aria-label={`${title} chart`}
          onMouseMove={(event) => {
            setHover(nearestAt(event.clientX, event.currentTarget));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <line
            x1={pad}
            y1={height - pad}
            x2={width - pad}
            y2={height - pad}
            stroke="var(--color-glass-border)"
            strokeWidth="1"
          />
          {plotted.length > 1 ? (
            <polyline fill="none" stroke={colorVar} strokeWidth="2" points={linePoints} />
          ) : (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              fill="var(--color-muted)"
              fontSize="12"
            >
              No data in range
            </text>
          )}
          {hover ? (
            <>
              <line
                x1={hover.x}
                y1={pad}
                x2={hover.x}
                y2={height - pad}
                stroke="var(--color-muted)"
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.7"
              />
              <circle
                cx={hover.x}
                cy={hover.y}
                r="4"
                fill={colorVar}
                stroke="var(--color-foreground)"
                strokeWidth="1.5"
              />
            </>
          ) : null}
        </svg>
        {hover ? (
          <div
            className="pointer-events-none absolute top-2 rounded-md px-2 py-1 text-[11px] leading-snug"
            style={{
              left: `clamp(0px, calc(${(hover.x / width) * 100}% - 4rem), calc(100% - 8rem))`,
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
              color: 'var(--color-foreground)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="font-medium">
              {hover.value.toFixed(2)} {unit}
            </div>
            <div className="text-muted">{formatHoverTime(hover.ts)}</div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

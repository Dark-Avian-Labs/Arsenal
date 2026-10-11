import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { smoothBandPath, smoothLinePath, smoothLinePathMasked } from './chartPath';

export type ChartPoint = {
  ts: number;
  success: number;
  failure: number;
  other: number;
  total: number;
  medianDurationMs: number | null;
};

type Mode = 'volume' | 'duration';

const HEIGHT = 400;
const FALLBACK_WIDTH = 960;
const PAD = { top: 18, right: 18, bottom: 28, left: 44 };
const STROKE = 1.5;

const COLORS = {
  success: 'var(--color-success)',
  other: 'var(--color-muted)',
  failure: 'var(--color-danger)',
  duration: 'var(--color-accent)',
  durationFill: 'var(--color-accent-weak-2)',
};

function formatHoverTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

function xAt(index: number, count: number, width: number): number {
  const inner = width - PAD.left - PAD.right;
  if (count <= 1) return PAD.left + inner / 2;
  return PAD.left + (index / (count - 1)) * inner;
}

function yAt(value: number, max: number): number {
  const inner = HEIGHT - PAD.top - PAD.bottom;
  if (max <= 0) return HEIGHT - PAD.bottom;
  return HEIGHT - PAD.bottom - (Math.max(0, value) / max) * inner;
}

export function ActionsChart({ points }: { points: ChartPoint[] }) {
  const [mode, setMode] = useState<Mode>('volume');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  const frameRef = useRef<HTMLDivElement>(null);
  const clipId = useId().replace(/:/g, '');

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const sync = () => {
      const next = Math.round(el.clientWidth);
      if (next > 0) setWidth(next);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const chart = useMemo(() => {
    const count = points.length;
    if (count === 0) {
      return {
        layers: null as null | {
          successFill: string;
          otherFill: string;
          failureFill: string;
          successStroke: string;
          otherStroke: string;
        },
        durationPath: '',
        durationArea: '',
        maxVolume: 0,
        maxDuration: 0,
        ticks: [] as number[],
        tops: [] as Array<{ x: number; y: number }>,
      };
    }

    if (mode === 'volume') {
      const maxVolume = Math.max(...points.map((p) => p.total), 1);
      const base = points.map((_, i) => ({ x: xAt(i, count, width), y: yAt(0, maxVolume) }));
      const successTop = points.map((p, i) => ({
        x: xAt(i, count, width),
        y: yAt(p.success, maxVolume),
      }));
      const otherTop = points.map((p, i) => ({
        x: xAt(i, count, width),
        y: yAt(p.success + p.other, maxVolume),
      }));
      const failureTop = points.map((p, i) => ({
        x: xAt(i, count, width),
        y: yAt(p.total, maxVolume),
      }));
      return {
        layers: {
          successFill: smoothBandPath(successTop, base),
          otherFill: smoothBandPath(otherTop, successTop),
          failureFill: smoothBandPath(failureTop, otherTop),
          successStroke: smoothLinePath(successTop),
          // ponytail: no failure stroke — zero-height tops share the success edge
          otherStroke: smoothLinePathMasked(
            otherTop,
            points.map((p) => p.other > 0),
          ),
        },
        durationPath: '',
        durationArea: '',
        maxVolume,
        maxDuration: 0,
        ticks: [0, maxVolume / 2, maxVolume],
        tops: failureTop,
      };
    }

    const durations = points.map((p) => p.medianDurationMs).filter((v): v is number => v != null);
    const maxDuration = Math.max(...durations, 1);
    const line = points.map((p, i) => ({
      x: xAt(i, count, width),
      y: yAt(p.medianDurationMs ?? 0, maxDuration),
    }));
    const base = points.map((_, i) => ({ x: xAt(i, count, width), y: yAt(0, maxDuration) }));
    return {
      layers: null,
      durationPath: smoothLinePath(line),
      durationArea: smoothBandPath(line, base),
      maxVolume: 0,
      maxDuration,
      ticks: [0, maxDuration / 2, maxDuration],
      tops: line,
    };
  }, [mode, points, width]);

  const hover = hoverIndex != null ? points[hoverIndex] : null;
  const hoverPoint = hoverIndex != null ? chart.tops[hoverIndex] : null;

  function nearestIndex(clientX: number, svg: SVGSVGElement): number | null {
    if (points.length === 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const x = ((clientX - rect.left) / rect.width) * width;
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
      const dist = Math.abs(xAt(i, points.length, width) - x);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    return best;
  }

  return (
    <section className="glass-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-foreground text-sm font-semibold">
          {mode === 'volume' ? 'Runs over time' : 'Median duration'}
        </h3>
        <div className="ml-auto flex gap-1" role="tablist" aria-label="Chart metric">
          <button
            type="button"
            className={mode === 'volume' ? 'tab active' : 'tab'}
            role="tab"
            aria-selected={mode === 'volume'}
            onClick={() => setMode('volume')}
          >
            Volume
          </button>
          <button
            type="button"
            className={mode === 'duration' ? 'tab active' : 'tab'}
            role="tab"
            aria-selected={mode === 'duration'}
            onClick={() => setMode('duration')}
          >
            Duration
          </button>
        </div>
      </div>

      {mode === 'volume' ? (
        <div className="text-muted mt-2 flex flex-wrap gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: COLORS.success }}
            />
            Success
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: COLORS.other }}
            />
            Other
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: COLORS.failure }}
            />
            Failure
          </span>
        </div>
      ) : null}

      <div ref={frameRef} className="relative mt-3">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          className="block h-[400px] w-full touch-pan-y"
          role="img"
          aria-label={mode === 'volume' ? 'Stacked runs over time' : 'Median duration over time'}
          onMouseMove={(event) => setHoverIndex(nearestIndex(event.clientX, event.currentTarget))}
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <clipPath id={`forgejo-plot-clip-${clipId}`}>
              <rect
                x={PAD.left}
                y={PAD.top}
                width={width - PAD.left - PAD.right}
                height={HEIGHT - PAD.top - PAD.bottom}
              />
            </clipPath>
          </defs>

          {chart.ticks.map((tick) => {
            const y = yAt(tick, mode === 'volume' ? chart.maxVolume : chart.maxDuration);
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={width - PAD.right}
                  y2={y}
                  stroke="var(--color-glass-border)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.7"
                />
                <text
                  x={PAD.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="var(--color-muted)"
                  fontSize="11"
                >
                  {mode === 'volume' ? Math.round(tick) : formatMs(tick)}
                </text>
              </g>
            );
          })}

          <g clipPath={`url(#forgejo-plot-clip-${clipId})`}>
            {mode === 'volume' && chart.layers ? (
              <>
                <path d={chart.layers.successFill} fill={COLORS.success} opacity="0.55" />
                <path d={chart.layers.otherFill} fill={COLORS.other} opacity="0.35" />
                <path d={chart.layers.failureFill} fill={COLORS.failure} opacity="0.55" />
                <path
                  d={chart.layers.successStroke}
                  fill="none"
                  stroke={COLORS.success}
                  strokeWidth={STROKE}
                />
                <path
                  d={chart.layers.otherStroke}
                  fill="none"
                  stroke={COLORS.other}
                  strokeWidth={STROKE}
                />
              </>
            ) : null}

            {mode === 'duration' ? (
              <>
                <path d={chart.durationArea} fill={COLORS.durationFill} />
                <path
                  d={chart.durationPath}
                  fill="none"
                  stroke={COLORS.duration}
                  strokeWidth={STROKE}
                />
              </>
            ) : null}

            {hover && hoverPoint ? (
              <>
                <line
                  x1={hoverPoint.x}
                  y1={PAD.top}
                  x2={hoverPoint.x}
                  y2={HEIGHT - PAD.bottom}
                  stroke="var(--color-muted)"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <circle
                  cx={hoverPoint.x}
                  cy={hoverPoint.y}
                  r="4"
                  fill={
                    mode === 'duration'
                      ? COLORS.duration
                      : hover.failure > 0
                        ? COLORS.failure
                        : hover.other > 0
                          ? COLORS.other
                          : COLORS.success
                  }
                  stroke="var(--color-foreground)"
                  strokeWidth="1.5"
                />
              </>
            ) : null}
          </g>

          {points.length === 0 ? (
            <text
              x={width / 2}
              y={HEIGHT / 2}
              textAnchor="middle"
              fill="var(--color-muted)"
              fontSize="13"
            >
              No data in range
            </text>
          ) : null}

          {points.length > 0 ? (
            <>
              <text x={PAD.left} y={HEIGHT - 8} fill="var(--color-muted)" fontSize="11">
                {formatHoverTime(points[0]!.ts)}
              </text>
              <text
                x={width - PAD.right}
                y={HEIGHT - 8}
                textAnchor="end"
                fill="var(--color-muted)"
                fontSize="11"
              >
                {formatHoverTime(points[points.length - 1]!.ts)}
              </text>
            </>
          ) : null}
        </svg>

        {hover && hoverPoint ? (
          <div
            className="pointer-events-none absolute top-2 rounded-md px-2 py-1 text-[11px] leading-snug"
            style={{
              left: `clamp(0px, calc(${(hoverPoint.x / width) * 100}% - 4rem), calc(100% - 9rem))`,
              background: 'var(--color-glass)',
              border: '1px solid var(--color-glass-border)',
              color: 'var(--color-foreground)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="font-medium">{formatHoverTime(hover.ts)}</div>
            {mode === 'volume' ? (
              <div className="text-muted mt-0.5">
                {hover.total} runs · {hover.success} ok · {hover.failure} fail · {hover.other} other
              </div>
            ) : (
              <div className="text-muted mt-0.5">
                {hover.medianDurationMs == null
                  ? 'No finished runs'
                  : formatMs(hover.medianDurationMs)}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}

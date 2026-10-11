function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

/** Catmull-Rom to cubic Bezier. Control points are clamped so the curve does not overshoot. */
export function smoothLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const yLo = Math.min(p1.y, p2.y);
    const yHi = Math.max(p1.y, p2.y);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = clamp(p1.y + (p2.y - p0.y) / 6, yLo, yHi);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = clamp(p2.y - (p3.y - p1.y) / 6, yLo, yHi);
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Closed band between two polylines with matching length (upper then reverse lower). */
export function smoothBandPath(
  upper: Array<{ x: number; y: number }>,
  lower: Array<{ x: number; y: number }>,
): string {
  if (upper.length === 0 || lower.length === 0) return '';
  const top = smoothLinePath(upper);
  const bottom = smoothLinePath([...lower].reverse()).replace(/^M/, 'L');
  return `${top} ${bottom} Z`;
}

/** Smooth line, but only contiguous runs where mask[i] is true (skips zero-height overlaps). */
export function smoothLinePathMasked(
  points: Array<{ x: number; y: number }>,
  mask: boolean[],
): string {
  if (points.length === 0 || mask.length !== points.length) return '';
  const parts: string[] = [];
  let runStart = -1;
  for (let i = 0; i <= points.length; i += 1) {
    const on = i < points.length && mask[i]!;
    if (on && runStart < 0) runStart = i;
    if (!on && runStart >= 0) {
      parts.push(smoothLinePath(points.slice(runStart, i)));
      runStart = -1;
    }
  }
  return parts.filter(Boolean).join(' ');
}

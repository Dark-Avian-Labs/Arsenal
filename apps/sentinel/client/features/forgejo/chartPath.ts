type Point = { x: number; y: number };

type Cubic = {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x: number;
  y: number;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function num(value: number): string {
  return String(round2(value));
}

function sign(value: number): number {
  return value < 0 ? -1 : 1;
}

/** Steffen 1990 slope at the middle of three samples. Zero when the slope changes sign. */
function slope3(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const h0 = x1 - x0;
  const h1 = x2 - x1;
  const s0 = (y1 - y0) / h0;
  const s1 = (y2 - y1) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

function slope2(x0: number, y0: number, x1: number, y1: number, tangent: number): number {
  const h = x1 - x0;
  return h ? (3 * ((y1 - y0) / h) - tangent) / 2 : tangent;
}

function increasingX(points: Point[]): boolean {
  for (let i = 1; i < points.length; i += 1) {
    if (points[i]!.x <= points[i - 1]!.x) return false;
  }
  return true;
}

function cubic(x0: number, y0: number, x1: number, y1: number, t0: number, t1: number): Cubic {
  const dx = (x1 - x0) / 3;
  return {
    c1x: round2(x0 + dx),
    c1y: round2(y0 + dx * t0),
    c2x: round2(x1 - dx),
    c2y: round2(y1 - dx * t1),
    x: round2(x1),
    y: round2(y1),
  };
}

/** Monotone cubics in x order. Same construction as d3's curveMonotoneX. */
function monotoneCubics(points: Point[]): Cubic[] {
  const out: Cubic[] = [];
  let x0 = 0;
  let y0 = 0;
  let x1 = Number.NaN;
  let y1 = Number.NaN;
  let t0 = Number.NaN;
  let seen = 0;

  for (const point of points) {
    const x = point.x;
    const y = point.y;
    let t1 = Number.NaN;
    if (seen === 0) seen = 1;
    else if (seen === 1) seen = 2;
    else if (seen === 2) {
      seen = 3;
      t1 = slope3(x0, y0, x1, y1, x, y);
      out.push(cubic(x0, y0, x1, y1, slope2(x0, y0, x1, y1, t1), t1));
    } else {
      t1 = slope3(x0, y0, x1, y1, x, y);
      out.push(cubic(x0, y0, x1, y1, t0, t1));
    }
    x0 = x1;
    y0 = y1;
    x1 = x;
    y1 = y;
    t0 = t1;
  }

  if (seen === 3) out.push(cubic(x0, y0, x1, y1, t0, slope2(x0, y0, x1, y1, t0)));
  return out;
}

function polyline(points: Point[]): string {
  let d = `M ${num(points[0]!.x)} ${num(points[0]!.y)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${num(points[i]!.x)} ${num(points[i]!.y)}`;
  }
  return d;
}

function curvePath(points: Point[], reverse: boolean): string {
  if (points.length === 0) return '';
  if (points.length < 3 || !increasingX(points)) {
    const seq = reverse ? [...points].reverse() : points;
    return polyline(seq);
  }

  const cubics = monotoneCubics(points);
  if (!reverse) {
    let d = `M ${num(points[0]!.x)} ${num(points[0]!.y)}`;
    for (const curve of cubics) {
      d += ` C ${num(curve.c1x)} ${num(curve.c1y)}, ${num(curve.c2x)} ${num(curve.c2y)}, ${num(curve.x)} ${num(curve.y)}`;
    }
    return d;
  }

  const last = cubics[cubics.length - 1];
  const end = last ?? points[points.length - 1]!;
  let d = `M ${num(end.x)} ${num(end.y)}`;
  for (let i = cubics.length - 1; i >= 0; i -= 1) {
    const curve = cubics[i]!;
    const dest = i === 0 ? points[0]! : cubics[i - 1]!;
    d += ` C ${num(curve.c2x)} ${num(curve.c2y)}, ${num(curve.c1x)} ${num(curve.c1y)}, ${num(dest.x)} ${num(dest.y)}`;
  }
  return d;
}

/** Monotone cubic through samples with increasing x. The curve stays inside each segment. */
export function smoothLinePath(points: Point[]): string {
  return curvePath(points, false);
}

/** Y on the same curve `smoothLinePath` draws, so a marker can follow the pointer. */
export function smoothLineY(points: Point[], x: number): number {
  if (points.length === 0) return 0;
  const first = points[0]!;
  if (points.length === 1 || x <= first.x) return first.y;
  const last = points[points.length - 1]!;
  if (x >= last.x) return last.y;

  let index = 1;
  while (index < points.length - 1 && points[index]!.x < x) index += 1;
  const left = points[index - 1]!;
  const right = points[index]!;
  const span = right.x - left.x;
  if (!(span > 0)) return right.y;
  const t = (x - left.x) / span;
  if (points.length < 3 || !increasingX(points)) return left.y + (right.y - left.y) * t;

  const curve = monotoneCubics(points)[index - 1];
  if (!curve) return left.y + (right.y - left.y) * t;
  const y0 = round2(left.y);
  const u = 1 - t;
  return (
    u * u * u * y0 + 3 * u * u * t * curve.c1y + 3 * u * t * t * curve.c2y + t * t * t * curve.y
  );
}

/**
 * Closed band between two polylines.
 * The lower edge is the reverse of that polyline's own forward curve, so a stack
 * that reuses the points meets on one edge instead of two independently smoothed ones.
 */
export function smoothBandPath(upper: Point[], lower: Point[]): string {
  if (upper.length === 0 || lower.length === 0) return '';
  const top = curvePath(upper, false);
  const bottom = curvePath(lower, true).replace(/^M/, 'L');
  return `${top} ${bottom} Z`;
}

/** Smooth line, but only contiguous runs where mask[i] is true (skips zero-height overlaps). */
export function smoothLinePathMasked(points: Point[], mask: boolean[]): string {
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

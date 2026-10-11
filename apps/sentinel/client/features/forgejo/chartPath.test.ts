import { describe, expect, it } from 'vitest';

import { smoothBandPath, smoothLinePath, smoothLinePathMasked } from './chartPath.ts';

describe('chartPath', () => {
  it('builds smooth line and closed band paths', () => {
    const upper = [
      { x: 0, y: 10 },
      { x: 10, y: 20 },
      { x: 20, y: 12 },
    ];
    const lower = [
      { x: 0, y: 40 },
      { x: 10, y: 40 },
      { x: 20, y: 40 },
    ];
    expect(smoothLinePath(upper).startsWith('M ')).toBe(true);
    expect(smoothLinePath(upper)).toContain(' C ');
    expect(smoothBandPath(upper, lower).endsWith(' Z')).toBe(true);
  });

  it('does not overshoot a flat zero baseline', () => {
    const baseline = 40;
    const points = [
      { x: 0, y: baseline },
      { x: 10, y: baseline },
      { x: 20, y: 10 },
      { x: 30, y: baseline },
      { x: 40, y: baseline },
    ];
    const path = smoothLinePath(points);
    const ys = [...path.matchAll(/[\d.]+/g)].map(Number).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(baseline + 0.01);
  });

  it('skips masked-off points so zero-height strokes stay hidden', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 5 },
      { x: 30, y: 5 },
      { x: 40, y: 10 },
    ];
    const path = smoothLinePathMasked(points, [false, false, true, true, false]);
    expect(path.startsWith('M 20')).toBe(true);
    expect(path).not.toContain('M 0');
    expect(path).not.toContain('M 40');
  });
});

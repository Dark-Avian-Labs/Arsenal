import { describe, expect, it } from 'vitest';

import { smoothBandPath, smoothLinePath, smoothLinePathMasked, smoothLineY } from './chartPath.ts';

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

  it('keeps a rising series moving instead of shelving on the sample', () => {
    const points = [
      { x: 0, y: 10 },
      { x: 30, y: 20 },
      { x: 60, y: 40 },
      { x: 90, y: 70 },
    ];
    const nums =
      smoothLinePath(points)
        .match(/-?\d*\.?\d+/g)
        ?.map(Number) ?? [];
    const controlY = nums[3]!;
    expect(controlY).toBeGreaterThan(10);
    expect(controlY).toBeLessThan(20);
  });

  it('reuses one curve where two bands share an edge', () => {
    const edge = [
      { x: 0, y: 30 },
      { x: 10, y: 18 },
      { x: 20, y: 22 },
      { x: 30, y: 12 },
    ];
    const above = edge.map((point) => ({ x: point.x, y: point.y - 8 }));
    const upperBand = smoothBandPath(above, edge);
    const edgePath = smoothLinePath(edge);
    const edgeCubics = [...edgePath.matchAll(/C\s+(-?[\d.]+)\s+(-?[\d.]+),\s+(-?[\d.]+)\s+(-?[\d.]+)/g)];
    expect(edgeCubics.length).toBeGreaterThan(0);
    for (const cubic of edgeCubics) {
      const reversed = `C ${cubic[3]} ${cubic[4]}, ${cubic[1]} ${cubic[2]}`;
      expect(upperBand).toContain(reversed);
    }
    expect(
      smoothBandPath(
        edge,
        edge.map((point) => ({ x: point.x, y: 40 })),
      ).startsWith(edgePath),
    ).toBe(true);
  });

  it('samples between knots inside the segment', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 8 },
      { x: 20, y: 4 },
      { x: 30, y: 10 },
    ];
    const mid = smoothLineY(points, 5);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(8);
    expect(smoothLineY(points, 0)).toBe(0);
    expect(smoothLineY(points, 30)).toBe(10);
  });
});

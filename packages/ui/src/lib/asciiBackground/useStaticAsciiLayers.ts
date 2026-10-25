import { type RefObject, useEffect } from 'react';

import { canvasDpiScale, snapAsciiCellWidth } from './canvasDpiScale';
import {
  applyCascadiaTypographyToContext,
  buildCascadiaFontString,
  DEFAULT_CASCADIA_TYPOGRAPHY,
} from './cascadiaCanvasTypography';

const BOX_COLOR = '#404040';
const BOX_ALPHA = 0.2;
const CHARACTER_COLOR = '#c0c0c0';
const CHARACTER_ALPHA = 0.05;

type Metrics = {
  cols: number;
  cellW: number;
  cellH: number;
  w: number;
  h: number;
};

function paintLayer(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  metrics: Metrics,
  color: string,
  alpha: number,
): void {
  ctx.clearRect(0, 0, metrics.w, metrics.h);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? '';
    const y = r * metrics.cellH;
    for (let c = 0; c < metrics.cols; c++) {
      const ch = row[c];
      if (!ch || ch === ' ') continue;
      ctx.fillText(ch, c * metrics.cellW, y);
    }
  }
  ctx.globalAlpha = 1;
}

function solidBlockRowStep(
  ctx: CanvasRenderingContext2D,
  dpiScale: number,
  lineHeightPx: number,
): number {
  const scratch = document.createElement('canvas');
  scratch.width = 32;
  scratch.height = 96;
  const probe = scratch.getContext('2d', { willReadFrequently: true });
  if (!probe) return Math.ceil(lineHeightPx);

  probe.setTransform(dpiScale, 0, 0, dpiScale, 0, 0);
  probe.font = ctx.font;
  probe.textBaseline = 'top';
  probe.letterSpacing = '0px';
  probe.fontKerning = 'none';
  probe.fillStyle = '#fff';

  const maxDevice = Math.round(lineHeightPx * dpiScale);
  const minDevice = Math.max(1, maxDevice - 4);
  for (let device = maxDevice; device >= minDevice; device--) {
    probe.clearRect(0, 0, 16, 48);
    const step = device / dpiScale;
    probe.fillText('█', 0, 0);
    probe.fillText('█', 0, step);
    const column = probe.getImageData(6, 0, 1, device + 4).data;
    let solid = 0;
    let count = 0;
    for (let i = 4; i < device - 4; i++) {
      solid += column[i * 4 + 3] ?? 0;
      count += 1;
    }
    const body = count === 0 ? 0 : solid / count;
    if (body < 200) return Math.ceil(lineHeightPx);
    const floor = body * 0.9;
    let weak = false;
    for (let i = 4; i < device; i++) {
      if ((column[i * 4 + 3] ?? 0) < floor) {
        weak = true;
        break;
      }
    }
    if (!weak) return step;
  }
  return Math.ceil(lineHeightPx);
}

function sizeCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  metrics: Metrics,
): void {
  const dpiScale = canvasDpiScale();
  canvas.width = Math.floor(metrics.w * dpiScale);
  canvas.height = Math.floor(metrics.h * dpiScale);
  canvas.style.width = `${metrics.w}px`;
  canvas.style.height = `${metrics.h}px`;
  ctx.setTransform(dpiScale, 0, 0, dpiScale, 0, 0);
  ctx.imageSmoothingEnabled = false;
  applyCascadiaTypographyToContext(ctx, DEFAULT_CASCADIA_TYPOGRAPHY);
}

export function useStaticAsciiLayers(
  backRef: RefObject<HTMLCanvasElement | null>,
  frontRef: RefObject<HTMLCanvasElement | null>,
  backRows: string[],
  frontRows: string[],
): void {
  useEffect(() => {
    const backCanvas = backRef.current;
    const frontCanvas = frontRef.current;
    if (!backCanvas || !frontCanvas) return undefined;
    const backCtx = backCanvas.getContext('2d');
    const frontCtx = frontCanvas.getContext('2d');
    if (!backCtx || !frontCtx) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        await import('@fontsource-variable/cascadia-mono');
        const font = buildCascadiaFontString(DEFAULT_CASCADIA_TYPOGRAPHY);
        await document.fonts.load(font, 'M█▓▒░#');
        await document.fonts.ready;
      } catch {
        // Cascadia missing: the canvas falls back to the generic monospace in the stack.
      }
      if (cancelled) return;

      const rows = backRows.length;
      const cols = rows === 0 ? 0 : Math.max(...backRows.map((row) => row.length));
      if (rows === 0 || cols === 0) return;

      const dpiScale = canvasDpiScale();
      backCtx.imageSmoothingEnabled = false;
      applyCascadiaTypographyToContext(backCtx, DEFAULT_CASCADIA_TYPOGRAPHY);
      const cellW = snapAsciiCellWidth(backCtx, dpiScale);
      const cellH = solidBlockRowStep(backCtx, dpiScale, DEFAULT_CASCADIA_TYPOGRAPHY.lineHeightPx);
      const metrics: Metrics = { cols, cellW, cellH, w: cols * cellW, h: rows * cellH };
      sizeCanvas(backCanvas, backCtx, metrics);
      sizeCanvas(frontCanvas, frontCtx, metrics);
      if (cancelled) return;
      paintLayer(backCtx, backRows, metrics, BOX_COLOR, BOX_ALPHA);
      paintLayer(frontCtx, frontRows, metrics, CHARACTER_COLOR, CHARACTER_ALPHA);
    })();

    return () => {
      cancelled = true;
    };
  }, [backRef, backRows, frontRef, frontRows]);
}

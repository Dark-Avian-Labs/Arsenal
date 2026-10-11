import { useMemo, useRef } from 'react';

import boxesArt from '../assets/background-boxes.txt?raw';
import charsArt from '../assets/background-chars.txt?raw';
import { normalizeAsciiPair } from '../lib/asciiBackground/normalizeAsciiPair';
import { useStaticAsciiLayers } from '../lib/asciiBackground/useStaticAsciiLayers';

function splitLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines;
}

export function AsciiWaveBackground() {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const { base, alt } = useMemo(
    () => normalizeAsciiPair(splitLines(boxesArt), splitLines(charsArt)),
    [],
  );
  useStaticAsciiLayers(backRef, frontRef, base, alt);

  return (
    <div className="bg-art" aria-hidden="true">
      <canvas ref={backRef} />
      <canvas ref={frontRef} className="ascii-layer-front" />
    </div>
  );
}

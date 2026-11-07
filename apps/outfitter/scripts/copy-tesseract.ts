import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const tesseractJson = require.resolve('tesseract.js/package.json');
const coreDir = path.dirname(
  createRequire(tesseractJson).resolve('tesseract.js-core/package.json'),
);
const outDir = path.join(import.meta.dirname, '../public/tesseract');

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(
  path.join(path.dirname(tesseractJson), 'dist/worker.min.js'),
  path.join(outDir, 'worker.min.js'),
);
// createWorker('eng', 1) is LSTM-only; Tesseract picks one of these by browser SIMD support.
for (const variant of ['relaxedsimd-lstm', 'simd-lstm', 'lstm']) {
  const name = `tesseract-core-${variant}.wasm.js`;
  fs.copyFileSync(path.join(coreDir, name), path.join(outDir, name));
}

import { parentPort, workerData } from 'node:worker_threads';

import { processExports } from './queries.ts';

const skipPreserve = Boolean(
  workerData &&
  typeof workerData === 'object' &&
  'skipPreserve' in workerData &&
  workerData.skipPreserve === true,
);

try {
  const counts = processExports({ skipPreserve });
  parentPort?.postMessage({ ok: true, counts });
} catch (error) {
  parentPort?.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}

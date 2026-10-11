import { Worker } from 'node:worker_threads';

import { closeCatalogDb } from './connection.ts';

export type IsolatedExportCounts = {
  warframes: number;
  weapons: number;
  companions: number;
  mods: number;
  modSets: number;
  arcanes: number;
  abilities: number;
};

type WorkerMessage = { ok: true; counts: IsolatedExportCounts } | { ok: false; error: string };

export function processExportsIsolated(skipPreserve: boolean): Promise<IsolatedExportCounts> {
  // ponytail: the parsed export files stay in this worker. V8 does not give
  // that heap back to the OS, and PM2 kills Codex at 512MB. The worker exits
  // so the pages are released before wiki scraping starts. Upgrade path: stream
  // each export if one file no longer fits in the worker.
  closeCatalogDb();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./processExportsWorker.ts', import.meta.url), {
      workerData: { skipPreserve },
    });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    worker.once('message', (message: WorkerMessage) => {
      if (!message.ok) {
        fail(new Error(message.error || 'Export processing failed'));
        return;
      }
      if (settled) return;
      settled = true;
      resolve(message.counts);
    });
    worker.once('error', (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        fail(new Error(`Export worker exited with code ${code}`));
      }
    });
  });
}

import {
  optimizeLoadoutsAsync,
  type OptimizerRequest,
  type RankedLoadout,
} from '@shared/optimizer';

export type OptimizerWorkerRequest = {
  id: number;
  request: OptimizerRequest;
};

export type OptimizerWorkerMessage =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'results'; results: RankedLoadout[] }
  | { id: number; type: 'error'; error: string };

self.addEventListener('message', (event: MessageEvent<OptimizerWorkerRequest>) => {
  const { id, request } = event.data;
  void optimizeLoadoutsAsync(request, (done, total) => {
    const msg: OptimizerWorkerMessage = { id, type: 'progress', done, total };
    self.postMessage(msg);
  })
    .then((results) => {
      const msg: OptimizerWorkerMessage = { id, type: 'results', results };
      self.postMessage(msg);
    })
    .catch((err: unknown) => {
      const msg: OptimizerWorkerMessage = {
        id,
        type: 'error',
        error: err instanceof Error ? err.message : 'Calculate failed',
      };
      self.postMessage(msg);
    });
});

import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { closeActionsDb, getActionsDb } from './actions/db.ts';
import { startActionsPoller } from './actions/poller.ts';
import { createApp } from './app.ts';
import { APP_ID, APP_NAME, HOST, NODE_ENV, PORT, SHUTDOWN_TIMEOUT_MS } from './config.ts';
import { closeMetricsDb, getMetricsDb } from './metrics/db.ts';
import { rollupAndPrune } from './metrics/writer.ts';
import { startPm2Bridge } from './pm2/bridge.ts';

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
  defaultIngestUrl: `http://127.0.0.1:${PORT}/api/ingest`,
});

const { app } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});

getMetricsDb();
getActionsDb();
const pm2Bridge = NODE_ENV === 'test' ? null : startPm2Bridge();
const actionsPoller = NODE_ENV === 'test' ? null : startActionsPoller();
const rollupTimer =
  NODE_ENV === 'test'
    ? null
    : setInterval(
        () => {
          try {
            rollupAndPrune(getMetricsDb());
          } catch (err) {
            log('warn', 'metrics_rollup_failed', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        },
        5 * 60 * 1000,
      );

startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  beforeClose() {
    pm2Bridge?.stop();
    actionsPoller?.stop();
    if (rollupTimer) clearInterval(rollupTimer);
  },
  onClose() {
    closeMetricsDb();
    closeActionsDb();
  },
});

export default app;

import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.js';
import {
  APP_ID,
  APP_NAME,
  HOST,
  NODE_ENV,
  PORT,
  SESSION_DB_PATH,
  SHUTDOWN_TIMEOUT_MS,
} from './config.js';
import { closeSessionDb } from './db/connection.js';
import { closeMetricsDb, getMetricsDb } from './metrics/db.js';
import { rollupAndPrune } from './metrics/writer.js';
import { startPm2Bridge } from './pm2/bridge.js';

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
  defaultIngestUrl: `http://127.0.0.1:${PORT}/api/ingest`,
});

const { app, sessionStore } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'Session store ready', { app: APP_NAME, path: SESSION_DB_PATH });

getMetricsDb();
const pm2Bridge = NODE_ENV === 'test' ? null : startPm2Bridge();
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
    if (rollupTimer) clearInterval(rollupTimer);
  },
  onClose() {
    sessionStore.dispose();
    closeSessionDb();
    closeMetricsDb();
  },
});

export default app;

import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.js';
import {
  APP_DB_PATH,
  APP_ID,
  APP_NAME,
  HOST,
  NODE_ENV,
  PORT,
  SHUTDOWN_TIMEOUT_MS,
  ensureDataDirs,
} from './config.js';
import { closeAppDb } from './db/connection.js';

ensureDataDirs();

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'App database ready', { app: APP_NAME, path: APP_DB_PATH });

void startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  onClose: () => {
    let failed = false;
    try {
      closeAppDb();
    } catch (err) {
      failed = true;
      log('error', 'Failed to close app DB during shutdown', { error: String(err) });
    }
    if (failed) process.exit(1);
  },
});

export default app;

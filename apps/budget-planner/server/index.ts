import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.js';
import {
  APP_DB_PATH,
  APP_ID,
  APP_NAME,
  HOST,
  NODE_ENV,
  PORT,
  SESSION_DB_PATH,
  SHUTDOWN_TIMEOUT_MS,
  ensureDataDirs,
} from './config.js';
import { closeAppDb, closeSessionDb } from './db/connection.js';

ensureDataDirs();

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app, sessionStore } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'Session store ready', { app: APP_NAME, path: SESSION_DB_PATH });
log('info', 'App database ready', { app: APP_NAME, path: APP_DB_PATH });

void startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  onClose: () => {
    sessionStore.dispose();
    let failed = false;
    try {
      closeSessionDb();
    } catch (err) {
      failed = true;
      log('error', 'Failed to close session DB during shutdown', { error: String(err) });
    }
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

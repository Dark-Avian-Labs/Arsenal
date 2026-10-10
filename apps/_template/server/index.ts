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

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app, sessionStore } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'Session store ready', { app: APP_NAME, path: SESSION_DB_PATH });

startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  onClose() {
    sessionStore.dispose();
    closeSessionDb();
  },
});

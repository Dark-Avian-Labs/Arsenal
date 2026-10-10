import { createAppSentinelAgent, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.ts';
import { APP_ID, APP_NAME, HOST, NODE_ENV, PORT, SHUTDOWN_TIMEOUT_MS } from './config.ts';

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});

startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
});

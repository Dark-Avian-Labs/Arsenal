import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.ts';
import { APP_ID, APP_NAME, HOST, NODE_ENV, PORT, SHUTDOWN_TIMEOUT_MS } from './config.ts';
import { beforeCloseArmory, closeArmory, initArmory } from './init.ts';

initArmory();

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});

const server = startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  beforeClose: () => beforeCloseArmory(SHUTDOWN_TIMEOUT_MS),
  onClose: () => {
    try {
      closeArmory();
    } catch (err) {
      log('error', 'Failed to close DB connections during shutdown', {
        err: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  },
});
server.headersTimeout = 65_000;
server.requestTimeout = 120_000;

export default app;

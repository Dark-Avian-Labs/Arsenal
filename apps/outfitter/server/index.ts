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
import { closeAppDb, getAppDb } from './db/appDb.js';
import { closeSessionDb } from './db/connection.js';
import { catalogArtifactCount, catalogHeroCount } from './db/queries.js';
import { importCodexCatalog } from './import/codexCatalog.js';

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app, sessionStore } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'Session store ready', { app: APP_NAME, path: SESSION_DB_PATH });

try {
  const db = getAppDb();
  if (catalogHeroCount(db) === 0 || catalogArtifactCount(db) === 0) {
    const summary = importCodexCatalog();
    log('info', 'Imported Codex WoR catalog', summary);
  }
} catch (error) {
  log('warn', 'Codex catalog import skipped', {
    error: error instanceof Error ? error.message : String(error),
  });
}

void startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  onClose: () => {
    sessionStore.dispose();
    try {
      closeSessionDb();
    } catch (err) {
      log('error', 'Failed to close session DB during shutdown', { error: String(err) });
    }
    try {
      closeAppDb();
    } catch (err) {
      log('error', 'Failed to close app DB during shutdown', { error: String(err) });
    }
  },
});

export default app;

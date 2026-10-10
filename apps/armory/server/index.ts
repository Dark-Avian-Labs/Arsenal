import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.js';
import { stopModListCacheCleanup } from './cache/modListCache.js';
import {
  APP_ID,
  APP_NAME,
  CODEX_WARFRAME_CATALOG_DB_PATH,
  HOST,
  NODE_ENV,
  PORT,
  SESSION_DB_PATH,
  SHUTDOWN_TIMEOUT_MS,
  USING_INSECURE_DEV_SESSION_SECRET,
  ensureDataDirs,
} from './config.js';
import { closeAll } from './db/connection.js';
import { repairPlaceholderArtifactSlots } from './db/repairArtifactSlots.js';
import { createAppSchema } from './db/schema.js';
import {
  isAdminCatalogSyncRunning,
  waitForAdminCatalogSyncIdle,
} from './import/adminCatalogSyncJob.js';
import {
  catalogWarframeCount,
  codexCatalogDbExists,
  syncCodexWarframeCatalog,
} from './import/codexCatalog.js';

ensureDataDirs();
createAppSchema();
repairPlaceholderArtifactSlots();

try {
  if (catalogWarframeCount() === 0 && codexCatalogDbExists()) {
    const summary = syncCodexWarframeCatalog({
      onLog: (message, level = 'info') => {
        log(level === 'error' ? 'error' : 'info', message, { source: 'catalogSync' });
      },
    });
    log('info', 'Boot-synced Codex Warframe catalog', {
      source: CODEX_WARFRAME_CATALOG_DB_PATH,
      tables: summary.tables,
      imagesCopied: summary.imagesCopied,
    });
  }
} catch (error) {
  log('warn', 'Codex catalog sync skipped on boot', {
    error: error instanceof Error ? error.message : String(error),
    source: CODEX_WARFRAME_CATALOG_DB_PATH,
  });
}

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});

const { app, sessionStore } = createApp({
  metricsMiddleware: sentinelAgent?.middleware,
});
log('info', 'Session DB ready', { path: SESSION_DB_PATH });

if (USING_INSECURE_DEV_SESSION_SECRET) {
  const hostIsLoopback =
    HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1' || HOST === '[::1]';
  if (!hostIsLoopback) {
    log(
      'warn',
      'INSECURE DEV SESSION_SECRET is active while HOST is non-loopback. Set SESSION_SECRET or bind to 127.0.0.1.',
      { host: HOST },
    );
  } else {
    log(
      'warn',
      'Using insecure DEV SESSION_SECRET (ALLOW_INSECURE_DEV=1). Do not use in production.',
    );
  }
}

const server = startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  beforeClose: async () => {
    if (!isAdminCatalogSyncRunning()) return;
    log('info', 'Waiting for admin catalog sync before shutdown');
    const syncWaitMs = Math.max(SHUTDOWN_TIMEOUT_MS - 2000, 1000);
    const finished = await waitForAdminCatalogSyncIdle(syncWaitMs);
    if (!finished) {
      log('warn', 'Admin catalog sync still running; proceeding with shutdown');
    }
  },
  onClose: () => {
    stopModListCacheCleanup();
    sessionStore.dispose();
    try {
      closeAll();
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

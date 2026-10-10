import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.ts';
import { stopModListCacheCleanup } from './cache/modListCache.ts';
import {
  APP_ID,
  APP_NAME,
  CODEX_WARFRAME_CATALOG_DB_PATH,
  HOST,
  NODE_ENV,
  PORT,
  SHUTDOWN_TIMEOUT_MS,
  ensureDataDirs,
} from './config.ts';
import { closeAll } from './db/connection.ts';
import { repairPlaceholderArtifactSlots } from './db/repairArtifactSlots.ts';
import { createAppSchema } from './db/schema.ts';
import {
  isAdminCatalogSyncRunning,
  waitForAdminCatalogSyncIdle,
} from './import/adminCatalogSyncJob.ts';
import {
  catalogWarframeCount,
  codexCatalogDbExists,
  syncCodexWarframeCatalog,
} from './import/codexCatalog.ts';

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

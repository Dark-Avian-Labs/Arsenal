import './config.js';

import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.js';
import {
  APP_ID,
  APP_NAME,
  ensureDataDirs,
  HOST,
  NODE_ENV,
  PORT,
  SHUTDOWN_TIMEOUT_MS,
} from './config.js';
import { closeSessionDb, getSessionDb } from './db/sessionDb.js';
import { ensureSessionSchema } from './db/sessionSchema.js';
import { refreshEpic7DbAvailability } from './epic7DbState.js';
import { closeEpic7Db, getEpic7Db } from './games/epic7/index.js';
import { closeWarframeDb, getWarframeDb } from './games/warframe/index.js';
import { closeWorCatalogDb, closeWorDb, getWorCatalogDb, getWorDb } from './games/wor/index.js';
import { startAdminImportJob as startWarframeAdminImportJob } from './import/warframe/adminImportJob.js';
import { recoverImportLeaseOnStartup as recoverWarframeImportLeaseOnStartup } from './import/warframe/importRuns.js';
import { catalogNeedsImport as warframeCatalogNeedsImport } from './import/warframe/startupPipeline.js';
import {
  catalogNeedsImport,
  copyWorCatalogIntoCollectionIfNeeded,
  ensureWorCatalogSeededFromCollection,
  runWorStartupPipeline,
} from './import/wor/startupPipeline.js';
import { waitForWarframeSyncIdle } from './services/warframeSyncState.js';
import { refreshWorDbAvailability } from './worDbState.js';

ensureDataDirs();
ensureSessionSchema();
const sessionDb = getSessionDb();
function assertTableExists(db: { prepare: (sql: string) => unknown }, tableName: string): void {
  const row = (
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?") as {
      get: (param: string) => unknown;
    }
  ).get(tableName);
  if (!row) {
    throw new Error(`Required table "${tableName}" was not found.`);
  }
}

function ensureGameSchemasReady(): void {
  const warframeDb = getWarframeDb();
  const epic7Db = getEpic7Db();
  assertTableExists(warframeDb, 'worksheets');
  assertTableExists(warframeDb, 'columns');
  assertTableExists(warframeDb, 'rows');
  assertTableExists(warframeDb, 'cell_values');

  assertTableExists(epic7Db, 'game_accounts');
  assertTableExists(epic7Db, 'base_heroes');
  assertTableExists(epic7Db, 'base_artifacts');
  assertTableExists(epic7Db, 'account_heroes');
  assertTableExists(epic7Db, 'account_artifacts');

  const worDb = getWorDb();
  assertTableExists(worDb, 'game_accounts');
  assertTableExists(worDb, 'catalog_heroes');
  assertTableExists(worDb, 'catalog_artifacts');
  assertTableExists(worDb, 'catalog_demons');
  assertTableExists(worDb, 'account_heroes');
  assertTableExists(worDb, 'account_artifacts');
  assertTableExists(worDb, 'account_demons');
}
ensureGameSchemasReady();
void refreshEpic7DbAvailability();
void refreshWorDbAvailability().then(async () => {
  try {
    ensureWorCatalogSeededFromCollection();
    copyWorCatalogIntoCollectionIfNeeded();
    const catalogDb = getWorCatalogDb();
    if (catalogNeedsImport(catalogDb)) {
      log('info', 'WoR catalog empty — running fixture bootstrap import');
      await runWorStartupPipeline();
    }
  } catch (error) {
    log('error', 'WoR startup catalog bootstrap failed', {
      err: error instanceof Error ? error.message : String(error),
    });
  }
});
void (async () => {
  if (NODE_ENV === 'test') return;
  try {
    recoverWarframeImportLeaseOnStartup();
    if (warframeCatalogNeedsImport()) {
      log('info', 'Warframe catalog empty — running import bootstrap');
      const result = startWarframeAdminImportJob('system:startup');
      if (!result.started) {
        log('warn', 'Warframe startup import could not start', {
          reason: result.reason ?? 'unknown',
        });
      }
    }
  } catch (error) {
    log('error', 'Warframe startup catalog bootstrap failed', {
      err: error instanceof Error ? error.message : String(error),
    });
  }
})();

const sentinelAgent = createAppSentinelAgent({
  appId: APP_ID,
  displayName: APP_NAME,
  nodeEnv: NODE_ENV,
});
const { app, sessionStore } = createApp({
  sessionDb,
  metricsMiddleware: sentinelAgent?.middleware,
});

startServer({
  app,
  appName: APP_NAME,
  host: HOST,
  port: PORT,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
  sentinelAgent,
  beforeClose: async () => {
    const syncFinished = await waitForWarframeSyncIdle(Math.max(SHUTDOWN_TIMEOUT_MS - 2000, 1000));
    if (!syncFinished) {
      log('warn', 'Warframe sync still running; proceeding with shutdown');
    }
  },
  onClose: () => {
    sessionStore.dispose();
    try {
      closeSessionDb();
      closeWarframeDb();
      closeEpic7Db();
      closeWorDb();
      closeWorCatalogDb();
    } catch (err) {
      log('error', 'Failed to close DB connections during shutdown', {
        err: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  },
});

export default app;

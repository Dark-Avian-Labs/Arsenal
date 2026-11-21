import './config.ts';

import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import { createApp } from './app.ts';
import { APP_ID, APP_NAME, HOST, NODE_ENV, PORT, SHUTDOWN_TIMEOUT_MS } from './config.ts';
import { getWorCatalogDb } from './games/wor/index.ts';
import { beforeCloseCodex, closeCodex, initCodex } from './init.ts';

const autoScrapeOnBoot = process.env.CODEX_AUTO_SCRAPE_ON_BOOT === '1';

void initCodex({ syncSnapshots: !autoScrapeOnBoot }).then(async () => {
  if (!autoScrapeOnBoot) return;
  try {
    const [leaseMod, startupMod] = await Promise.all([
      import('./import/wor/importLease.ts'),
      import('./import/wor/startupPipeline.ts'),
    ]);
    const catalogDb = getWorCatalogDb();
    leaseMod.recoverWorImportLeaseOnStartup(catalogDb);
    startupMod.ensureWorCatalogSeededFromCollection();
    startupMod.copyWorCatalogIntoCollectionIfNeeded();
    if (startupMod.catalogNeedsImport(catalogDb)) {
      log('info', 'WoR catalog empty — running fixture bootstrap import');
      await startupMod.runWorStartupPipeline();
    }
  } catch (error) {
    log('error', 'WoR startup catalog bootstrap failed', {
      err: error instanceof Error ? error.message : String(error),
    });
  }
});

void (async () => {
  if (NODE_ENV === 'test' || !autoScrapeOnBoot) return;
  try {
    const [runsMod, startupMod, jobMod] = await Promise.all([
      import('./import/warframe/importRuns.ts'),
      import('./import/warframe/startupPipeline.ts'),
      import('./import/warframe/adminImportJob.ts'),
    ]);
    runsMod.recoverImportLeaseOnStartup();
    if (startupMod.catalogNeedsImport()) {
      log('info', 'Warframe catalog empty — running import bootstrap');
      const result = jobMod.startAdminImportJob('system:startup');
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
  beforeClose: () => beforeCloseCodex(SHUTDOWN_TIMEOUT_MS),
  onClose: () => {
    try {
      closeCodex();
    } catch (err) {
      log('error', 'Failed to close DB connections during shutdown', {
        err: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  },
});

export default app;

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAppSentinelAgent, log, startServer } from '@dark-avian-labs/server-kit';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  CLERK_WEBHOOK_SIGNING_SECRET,
  HOST,
  NODE_ENV,
  PORT,
  SHUTDOWN_TIMEOUT_MS,
  TRUST_PROXY,
  applyUnifiedSubAppEnv,
} from './config.ts';
import { createArsenalHostApp, parseHostMapEnv, type MountedAppId } from './hostRouter.ts';
import { deleteClerkUserAcrossApps } from './userCleanup.ts';

function resolvePackageClientDir(packageName: string): string {
  const pkgUrl = import.meta.resolve(`${packageName}/package.json`);
  const pkgDir = path.dirname(fileURLToPath(pkgUrl));
  return path.join(pkgDir, 'dist', 'client');
}

async function main(): Promise<void> {
  // 1. Configure shared paths and skip sub-app .env loading BEFORE importing any sub-app.
  applyUnifiedSubAppEnv();

  // 2. Dynamically import all 4 sub-app server factories & lifecycle hooks.
  const [
    codexAppMod,
    codexProbesMod,
    codexCatalogSyncMod,
    codexWfMod,
    codexE7Mod,
    codexWorMod,
    armoryAppMod,
    armoryDbMod,
    armoryUsersMod,
    outfitterAppMod,
    outfitterDbMod,
    budgetAppMod,
    budgetDbMod,
  ] = await Promise.all([
    import('codex/server'),
    import('codex/probes'),
    import('codex/catalog-sync'),
    import('codex/warframe-db'),
    import('codex/epic7-db'),
    import('codex/wor-db'),
    import('armory/server'),
    import('armory/db'),
    import('armory/users'),
    import('outfitter/server'),
    import('outfitter/db'),
    import('budget-planner/server'),
    import('budget-planner/db'),
  ]);

  if (NODE_ENV !== 'test') {
    codexCatalogSyncMod.syncCatalogSnapshotsToCollectionsOnBoot();
  }

  const sentinelAgent = createAppSentinelAgent({
    appId: APP_ID,
    displayName: APP_NAME,
    nodeEnv: NODE_ENV,
  });

  const codexBundle = codexAppMod.createApp({
    clientDir: resolvePackageClientDir('codex'),
  });
  const armoryBundle = armoryAppMod.createApp({
    clientDir: resolvePackageClientDir('armory'),
  });
  const outfitterBundle = outfitterAppMod.createApp({
    clientDir: resolvePackageClientDir('outfitter'),
  });
  const budgetBundle = budgetAppMod.createApp({
    clientDir: resolvePackageClientDir('budget-planner'),
  });

  const defaultAppRaw = process.env.ARSENAL_DEFAULT_APP?.trim().toLowerCase();
  const defaultApp: MountedAppId =
    defaultAppRaw === 'armory' ||
    defaultAppRaw === 'outfitter' ||
    defaultAppRaw === 'budget-planner'
      ? defaultAppRaw
      : 'codex';

  const hostApp = createArsenalHostApp({
    appVersion: APP_VERSION,
    trustProxy: TRUST_PROXY,
    defaultApp,
    hostMap: parseHostMapEnv(process.env.ARSENAL_HOST_MAP),
    allowHeaderOverride: NODE_ENV !== 'production',
    metricsMiddleware: sentinelAgent?.middleware,
    apps: {
      codex: codexBundle.app,
      armory: armoryBundle.app,
      outfitter: outfitterBundle.app,
      'budget-planner': budgetBundle.app,
    },
    readinessChecks: {
      codex: async () => {
        await codexProbesMod.assertCodexReady();
        return true;
      },
      armory: () => {
        armoryDbMod.getCatalogDb().prepare('SELECT 1').get();
        armoryDbMod.getUserDb().prepare('SELECT 1').get();
        return true;
      },
      outfitter: () => {
        outfitterDbMod.getAppDb().prepare('SELECT 1').get();
        return true;
      },
      'budget-planner': () => {
        budgetDbMod.getAppDb().prepare('SELECT 1').get();
        return true;
      },
    },
    webhookHandlers: {
      signingSecret: () => CLERK_WEBHOOK_SIGNING_SECRET,
      onUserCreated: (data) => {
        const username = typeof data.username === 'string' ? data.username.trim() : '';
        if (username.length > 0) armoryUsersMod.upsertArmoryUser(data.id, username);
      },
      onUserUpdated: (data) => {
        const username = typeof data.username === 'string' ? data.username.trim() : '';
        armoryUsersMod.upsertArmoryUser(data.id, username.length > 0 ? username : null);
      },
      onUserDeleted: (userId) => {
        deleteClerkUserAcrossApps(userId, {
          armoryMarkDeleted: armoryUsersMod.markArmoryUserDeleted,
          budgetDb: () => budgetDbMod.getAppDb(),
          outfitterDb: () => outfitterDbMod.getAppDb(),
          codexWarframeDb: () => codexWfMod.getWarframeDb(),
          codexEpic7Db: () => codexE7Mod.getEpic7Db(),
          codexWorDb: () => codexWorMod.getWorDb(),
        });
      },
    },
  });

  startServer({
    app: hostApp,
    appName: APP_NAME,
    host: HOST,
    port: PORT,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
    sentinelAgent,
    onClose: () => {
      try {
        codexWfMod.closeWarframeDb();
        codexE7Mod.closeEpic7Db();
        codexWorMod.closeWorDb();
        codexWorMod.closeWorCatalogDb();
        armoryDbMod.closeAll();
        outfitterDbMod.closeAppDb();
        budgetDbMod.closeAppDb();
      } catch (err) {
        log('error', 'Failed to close unified Arsenal DB connections during shutdown', {
          err: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      }
    },
  });
}

main().catch((err: unknown) => {
  log('error', 'Arsenal failed to boot', {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});

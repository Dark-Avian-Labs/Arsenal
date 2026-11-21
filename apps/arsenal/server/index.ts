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
import {
  createArsenalHostApp,
  MOUNTED_APP_LABELS,
  parseHostMapEnv,
  resolveMountedAppId,
  type MountedAppId,
} from './hostRouter.ts';

function resolvePackageClientDir(packageName: string): string {
  const pkgUrl = import.meta.resolve(`${packageName}/package.json`);
  const pkgDir = path.dirname(fileURLToPath(pkgUrl));
  return path.join(pkgDir, 'dist', 'client');
}

async function main(): Promise<void> {
  // 1. Configure shared paths and isolate sub-app env BEFORE importing any sub-app.
  applyUnifiedSubAppEnv();

  // 2. Dynamically import all 4 sub-app server factories & lifecycle hooks (compiled JS in prod).
  const [
    codexAppMod,
    codexInitMod,
    codexProbesMod,
    armoryAppMod,
    armoryInitMod,
    armoryDbMod,
    armoryUsersMod,
    outfitterAppMod,
    outfitterInitMod,
    outfitterDbMod,
    budgetAppMod,
    budgetDbMod,
  ] = await Promise.all([
    import('codex/server'),
    import('codex/init'),
    import('codex/probes'),
    import('armory/server'),
    import('armory/init'),
    import('armory/db'),
    import('armory/users'),
    import('outfitter/server'),
    import('outfitter/init'),
    import('outfitter/db'),
    import('budget-planner/server'),
    import('budget-planner/db'),
  ]);

  // 3. Run each sub-app's startup initialization (schemas, stale job cleanup, catalog syncs).
  await codexInitMod.initCodex();
  armoryInitMod.initArmory();
  outfitterInitMod.initOutfitter();

  const defaultAppRaw = process.env.ARSENAL_DEFAULT_APP?.trim().toLowerCase();
  const defaultApp: MountedAppId =
    defaultAppRaw === 'armory' ||
    defaultAppRaw === 'outfitter' ||
    defaultAppRaw === 'budget-planner'
      ? defaultAppRaw
      : 'codex';
  const hostMap = parseHostMapEnv(process.env.ARSENAL_HOST_MAP);
  const allowHeaderOverride = NODE_ENV !== 'production';

  const sentinelAgent = createAppSentinelAgent({
    appId: APP_ID,
    displayName: APP_NAME,
    nodeEnv: NODE_ENV,
    resolveRequestApp: (req) => {
      const targetId = resolveMountedAppId(req, { hostMap, defaultApp, allowHeaderOverride });
      return MOUNTED_APP_LABELS[targetId];
    },
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

  const hostApp = createArsenalHostApp({
    appVersion: APP_VERSION,
    trustProxy: TRUST_PROXY,
    defaultApp,
    hostMap,
    allowHeaderOverride,
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
      // Match main branch behavior: mark Armory user deleted without hard-deleting Budget
      // shared plans, Codex worksheets, or Outfitter accounts.
      onUserDeleted: (userId) => {
        armoryUsersMod.markArmoryUserDeleted(userId);
      },
    },
  });

  const server = startServer({
    app: hostApp,
    appName: APP_NAME,
    host: HOST,
    port: PORT,
    shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
    sentinelAgent,
    beforeClose: async () => {
      await Promise.all([
        codexInitMod.beforeCloseCodex(SHUTDOWN_TIMEOUT_MS),
        armoryInitMod.beforeCloseArmory(SHUTDOWN_TIMEOUT_MS),
      ]);
    },
    onClose: () => {
      try {
        codexInitMod.closeCodex();
        armoryInitMod.closeArmory();
        outfitterInitMod.closeOutfitter();
        budgetDbMod.closeAppDb();
      } catch (err) {
        log('error', 'Failed to close unified Arsenal DB connections during shutdown', {
          err: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      }
    },
  });
  server.headersTimeout = 65_000;
  server.requestTimeout = 120_000;
}

main().catch((err: unknown) => {
  log('error', 'Arsenal failed to boot', {
    err: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  process.exit(1);
});

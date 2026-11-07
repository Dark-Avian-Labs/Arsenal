import { createApp as createKitApp } from '@dark-avian-labs/server-kit';
import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.ts';
import { getMetricsDb } from './metrics/db.ts';
import { hasIngestToken, ingestRouter } from './metrics/ingestRoute.ts';
import { apiRouter } from './routes/api.ts';

export interface AppBundle {
  app: express.Express;
  apiRouter: express.Router;
}

export function createApp(options: { metricsMiddleware?: express.RequestHandler } = {}): AppBundle {
  ensureDataDirs();

  const ingestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const appId = (req.body as { samples?: Array<{ appId?: unknown }> } | undefined)?.samples?.[0]
        ?.appId;
      return hasIngestToken(req) && typeof appId === 'string'
        ? `app:${appId}`
        : ipKeyGenerator(req.ip ?? '');
    },
  });

  const bundle = createKitApp({
    appName: APP_NAME,
    appId: APP_ID,
    appVersion: APP_VERSION,
    projectRoot: PROJECT_ROOT,
    nodeEnv: NODE_ENV,
    trustProxy: TRUST_PROXY,
    secureCookies: SECURE_COOKIES,
    legalPageUrl: LEGAL_PAGE_URL,
    metricsMiddleware: options.metricsMiddleware,
    readiness: () => {
      getMetricsDb().prepare('SELECT 1').get();
      return true;
    },
    // Agents share 127.0.0.1, so ingest skips the per-IP baseline and /api limiters.
    mountBeforeApi: (app) => {
      app.use('/api/ingest', express.json({ limit: '100kb' }), ingestLimiter, ingestRouter);
    },
  });

  bundle.apiRouter.use(apiRouter);

  return { app: bundle.app, apiRouter: bundle.apiRouter };
}

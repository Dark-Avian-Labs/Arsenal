import { createApp as createKitApp } from '@dark-avian-labs/server-kit';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

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
} from './config.js';
import { getMetricsDb } from './metrics/db.js';
import { ingestRouter } from './metrics/ingestRoute.js';
import { apiRouter } from './routes/api.js';

export interface AppBundle {
  app: express.Express;
  apiRouter: express.Router;
}

export function createApp(options: { metricsMiddleware?: express.RequestHandler } = {}): AppBundle {
  ensureDataDirs();

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
  });

  const ingestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  bundle.apiRouter.use('/ingest', ingestLimiter, ingestRouter);
  bundle.apiRouter.use(apiRouter);

  return { app: bundle.app, apiRouter: bundle.apiRouter };
}

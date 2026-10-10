import { createApp as createKitApp } from '@dark-avian-labs/server-kit';
import express from 'express';

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
import { apiRouter } from './routes/api.ts';

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
  });

  bundle.apiRouter.use(apiRouter);

  return { app: bundle.app, apiRouter: bundle.apiRouter };
}

import { createApp as createKitApp } from '@dark-avian-labs/server-kit';
import type Database from 'better-sqlite3';
import express from 'express';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  CLERK_CONFIGURED,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.js';
import { createAppSchema } from './db/appSchema.js';
import { getAppDb } from './db/connection.js';
import { apiRouter } from './routes/api.js';

export interface AppBundle {
  app: express.Express;
  appDb: Database.Database;
}

export interface CreateAppOptions {
  appDb?: Database.Database;
  metricsMiddleware?: express.RequestHandler;
}

export function createApp(options: CreateAppOptions = {}): AppBundle {
  ensureDataDirs();

  const appDb = options.appDb ?? getAppDb();
  createAppSchema(appDb);

  if (CLERK_CONFIGURED) {
    console.log(`[${APP_NAME}] Clerk auth enabled`);
  } else {
    console.warn(`[${APP_NAME}] Clerk keys missing — auth routes will return 503`);
  }

  const bundle = createKitApp({
    appName: APP_NAME,
    appId: APP_ID,
    appVersion: APP_VERSION,
    projectRoot: PROJECT_ROOT,
    nodeEnv: NODE_ENV,
    trustProxy: TRUST_PROXY,
    secureCookies: SECURE_COOKIES,
    legalPageUrl: LEGAL_PAGE_URL,
    jsonLimit: '64kb',
    metricsMiddleware: options.metricsMiddleware,
    helmet: { hsts: NODE_ENV === 'production' },
    readiness: () => {
      appDb.prepare('SELECT 1').get();
      return true;
    },
  });

  bundle.apiRouter.use(apiRouter);
  return { app: bundle.app, appDb };
}

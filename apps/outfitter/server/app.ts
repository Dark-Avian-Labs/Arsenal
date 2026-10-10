import { createApp as createKitApp } from '@dark-avian-labs/server-kit';
import express from 'express';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  HERO_IMAGES_DIR,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.ts';
import { getAppDb } from './db/appDb.ts';
import { apiRouter } from './routes/api.ts';

export interface AppBundle {
  app: express.Express;
}

export interface CreateAppOptions {
  metricsMiddleware?: express.RequestHandler;
  helmet?: { extraScriptSrc?: string[]; extraConnectSrc?: string[] };
}

export function createApp(options: CreateAppOptions = {}): AppBundle {
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
    helmet: options.helmet,
    readiness: () => {
      getAppDb().prepare('SELECT 1').get();
      return true;
    },
    mount(app) {
      app.use('/api', (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      });

      app.use('/hero-images', express.static(HERO_IMAGES_DIR, { maxAge: '1h' }));
      app.get('/auth/legal', (_req, res) => {
        res.redirect(LEGAL_PAGE_URL);
      });
    },
  });

  bundle.apiRouter.use(apiRouter);
  return { app: bundle.app };
}

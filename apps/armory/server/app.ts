import path from 'path';

import { createApp as createKitApp, log } from '@dark-avian-labs/server-kit';
import type Database from 'better-sqlite3';
import express from 'express';
import { rateLimit } from 'express-rate-limit';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  IMAGES_DIR,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.ts';
import { getCatalogDb, getUserDb } from './db/connection.ts';
import { apiRouter } from './routes/api.ts';
import { authRouter } from './routes/auth.ts';
import { clerkWebhookRouter } from './routes/webhooks.ts';

export interface AppBundle {
  app: express.Express;
}

export interface CreateAppOptions {
  catalogDb?: Database.Database;
  userDb?: Database.Database;
  metricsMiddleware?: express.RequestHandler;
}

const GAME_ASSET_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

export function createApp(options: CreateAppOptions = {}): AppBundle {
  ensureDataDirs();

  const catalogDb = options.catalogDb ?? null;
  const userDb = options.userDb ?? null;
  const resolveCatalogDb = (): Database.Database => catalogDb ?? getCatalogDb();
  const resolveUserDb = (): Database.Database => userDb ?? getUserDb();

  const webhookLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });
  const writeApiLimiter = rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many write requests, please try again later' },
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
    jsonLimit: '1mb',
    metricsMiddleware: options.metricsMiddleware,
    readiness: () => {
      try {
        resolveCatalogDb().prepare('SELECT 1').get();
        resolveUserDb().prepare('SELECT 1').get();
        return true;
      } catch (err) {
        log('error', 'Readiness check failed', {
          err: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    mountBeforeApi(app) {
      app.use(
        '/api/webhooks/clerk',
        webhookLimiter,
        express.raw({ type: 'application/json' }),
        clerkWebhookRouter,
      );
    },
    installSession(app) {
      app.use('/api', (req, res, next) => {
        const method = req.method.toUpperCase();
        if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
          writeApiLimiter(req, res, next);
          return;
        }
        next();
      });

      app.use('/images', (req, res, next) => {
        if (/\.hash$/i.test(req.path)) {
          res.status(404).end();
          return;
        }
        next();
      });
      app.use(
        '/images',
        express.static(IMAGES_DIR, {
          maxAge: GAME_ASSET_MAX_AGE_MS,
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.hash')) {
              res.setHeader('Cache-Control', 'no-store');
            }
          },
        }),
      );
      app.use(
        '/icons',
        express.static(path.join(PROJECT_ROOT, 'icons'), { maxAge: GAME_ASSET_MAX_AGE_MS }),
      );
      app.get('/auth/profile', (_req, res) => {
        res.redirect('/sign-in');
      });
      app.get('/profile', (_req, res) => {
        res.redirect('/sign-in');
      });
      app.get('/auth/legal', (_req, res) => {
        res.redirect(LEGAL_PAGE_URL);
      });
      app.get('/login', (_req, res) => {
        res.redirect('/sign-in');
      });
    },
  });

  bundle.apiRouter.use('/auth', authRouter);
  bundle.apiRouter.use(apiRouter);
  return { app: bundle.app };
}

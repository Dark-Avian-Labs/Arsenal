import path from 'path';

import { createApp as createKitApp, getClerkAuthState, log } from '@dark-avian-labs/server-kit';
import type Database from 'better-sqlite3';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  COOKIE_DOMAIN,
  IMAGES_DIR,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.js';
import { getCatalogDb, getSessionDb, getUserDb } from './db/connection.js';
import { SqliteSessionStore } from './db/sqliteSessionStore.js';
import { apiRouter } from './routes/api.js';
import { authRouter, issueCsrfToken } from './routes/auth.js';
import { clerkWebhookRouter } from './routes/webhooks.js';
import { bindClerkUserSessionMiddleware } from './session/bindClerkUserSession.js';

export interface AppBundle {
  app: express.Express;
  sessionDb: Database.Database;
  sessionStore: SqliteSessionStore;
}

export interface CreateAppOptions {
  sessionDb?: Database.Database;
  catalogDb?: Database.Database;
  userDb?: Database.Database;
  sessionCleanupIntervalMs?: number;
  metricsMiddleware?: express.RequestHandler;
}

const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const GAME_ASSET_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function isSameHostOrigin(req: express.Request, origin: string): boolean {
  try {
    const parsedOrigin = new URL(origin);
    const hostHeader = req.headers.host;
    if (typeof hostHeader !== 'string' || hostHeader.length === 0) {
      return false;
    }
    return parsedOrigin.host === hostHeader;
  } catch {
    return false;
  }
}

export function createApp(options: CreateAppOptions = {}): AppBundle {
  ensureDataDirs();

  const sessionDb = options.sessionDb ?? getSessionDb();
  const catalogDb = options.catalogDb ?? null;
  const userDb = options.userDb ?? null;
  const resolveCatalogDb = (): Database.Database => catalogDb ?? getCatalogDb();
  const resolveUserDb = (): Database.Database => userDb ?? getUserDb();

  const sessionStore = new SqliteSessionStore({
    db: sessionDb,
    cleanupIntervalMs:
      options.sessionCleanupIntervalMs ?? (NODE_ENV === 'test' ? 0 : 15 * 60 * 1000),
  });

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
        sessionDb.prepare('SELECT 1').get();
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
        compression({
          filter: (req, res) => {
            if (req.path.includes('/stream')) return false;
            const accept = req.headers.accept;
            if (typeof accept === 'string' && accept.includes('text/event-stream')) return false;
            const contentType = res.getHeader('Content-Type');
            if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
              return false;
            }
            return compression.filter(req, res);
          },
        }),
      );
      app.use(
        '/api/webhooks/clerk',
        webhookLimiter,
        express.raw({ type: 'application/json' }),
        clerkWebhookRouter,
      );
      app.use(cookieParser());
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

      const cookieOptions: express.CookieOptions = {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'lax',
      };
      if (COOKIE_DOMAIN) cookieOptions.domain = COOKIE_DOMAIN;

      app.use(
        session({
          name: SESSION_COOKIE_NAME,
          store: sessionStore,
          secret: SESSION_SECRET,
          resave: false,
          saveUninitialized: false,
          cookie: cookieOptions,
        }),
      );

      const { csrfSynchronisedProtection, generateToken } = csrfSync({
        getTokenFromRequest: (req: express.Request) => {
          if (req.body?._csrf) return req.body._csrf as string;
          const header = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
          return (Array.isArray(header) ? header[0] : header) ?? null;
        },
        getTokenFromState: (req) => {
          const s = req.session;
          if (!s) return null;
          return (s as { csrfToken?: string }).csrfToken ?? null;
        },
        storeTokenInState: (req, token) => {
          if (req.session) {
            req.session.csrfToken = token as string;
          }
        },
      });

      app.use(csrfSynchronisedProtection);
      app.locals.generateCsrfToken = generateToken;
      app.use(
        '/api',
        bindClerkUserSessionMiddleware(
          (req) => getClerkAuthState(req).userId,
          (req) => {
            const generate = req.app.locals.generateCsrfToken as
              | ((request: express.Request, overwrite?: boolean) => string)
              | undefined;
            generate?.(req, true);
          },
        ),
      );

      app.use((req, res, next) => {
        if (!CSRF_PROTECTED_METHODS.has(req.method.toUpperCase())) {
          next();
          return;
        }

        const secFetchSiteHeader = req.headers['sec-fetch-site'];
        const secFetchSite = Array.isArray(secFetchSiteHeader)
          ? secFetchSiteHeader[0]
          : secFetchSiteHeader;
        if (typeof secFetchSite === 'string' && secFetchSite.toLowerCase() === 'cross-site') {
          res
            .status(403)
            .json({ error: 'Cross-site request blocked', code: 'CSRF_ORIGIN_INVALID' });
          return;
        }

        const originHeader = req.headers.origin;
        const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
        if (typeof origin === 'string' && origin.length > 0 && !isSameHostOrigin(req, origin)) {
          res.status(403).json({ error: 'Origin not allowed', code: 'CSRF_ORIGIN_INVALID' });
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
  bundle.apiRouter.get('/csrf', issueCsrfToken);
  bundle.apiRouter.use(apiRouter);
  return { app: bundle.app, sessionDb, sessionStore };
}

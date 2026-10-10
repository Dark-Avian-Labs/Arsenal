import { createApp as createKitApp, getClerkAuthState } from '@dark-avian-labs/server-kit';
import type Database from 'better-sqlite3';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import session from 'express-session';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  COOKIE_DOMAIN,
  HERO_IMAGES_DIR,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.js';
import { getAppDb } from './db/appDb.js';
import { getSessionDb } from './db/connection.js';
import { SqliteSessionStore } from './db/sqliteSessionStore.js';
import { isAllowedMutatingOrigin } from './http/mutatingOrigin.js';
import { apiRouter } from './routes/api.js';
import { bindClerkUserSessionMiddleware } from './session/bindClerkUserSession.js';

export interface AppBundle {
  app: express.Express;
  sessionDb: Database.Database;
  sessionStore: SqliteSessionStore;
}

export interface CreateAppOptions {
  sessionDb?: Database.Database;
  metricsMiddleware?: express.RequestHandler;
}

const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp(options: CreateAppOptions = {}): AppBundle {
  ensureDataDirs();
  const sessionDb = options.sessionDb ?? getSessionDb();
  const sessionStore = new SqliteSessionStore({ db: sessionDb });

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
      sessionDb.prepare('SELECT 1').get();
      getAppDb().prepare('SELECT 1').get();
      return true;
    },
    mountBeforeApi(app) {
      app.use('/api/gear/ocr', express.json({ limit: '5mb' }));
      app.use('/api/artifacts/ocr', express.json({ limit: '5mb' }));
      app.use(cookieParser());
    },
    installSession(app) {
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
        if (typeof origin === 'string' && origin.length > 0) {
          const hostHeader = Array.isArray(req.headers.host)
            ? req.headers.host[0]
            : req.headers.host;
          if (!isAllowedMutatingOrigin(origin, hostHeader)) {
            res.status(403).json({ error: 'Origin not allowed', code: 'CSRF_ORIGIN_INVALID' });
            return;
          }
        }

        next();
      });

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
  return { app: bundle.app, sessionDb, sessionStore };
}

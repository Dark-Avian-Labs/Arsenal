import { createApp as createKitApp, getClerkAuthState } from '@dark-avian-labs/server-kit';
import type Database from 'better-sqlite3';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import session from 'express-session';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  COOKIE_DOMAIN,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  TRUST_PROXY,
  ensureDataDirs,
} from './config.js';
import { getSessionDb } from './db/connection.js';
import { SqliteSessionStore } from './db/sqliteSessionStore.js';
import { apiRouter } from './routes/api.js';
import { bindClerkUserSessionMiddleware } from './session/bindClerkUserSession.js';

export interface AppBundle {
  app: express.Express;
  apiRouter: express.Router;
  sessionDb: Database.Database;
  sessionStore: SqliteSessionStore;
}

export interface CreateAppOptions {
  sessionDb?: Database.Database;
  metricsMiddleware?: express.RequestHandler;
}

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
      return true;
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
    },
  });

  bundle.apiRouter.use(apiRouter);

  return { app: bundle.app, apiRouter: bundle.apiRouter, sessionDb, sessionStore };
}

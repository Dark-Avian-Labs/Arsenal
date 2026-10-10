import path from 'path';

import { createApp as createKitApp, getClerkAuthState } from '@dark-avian-labs/server-kit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { csrfSync } from 'csrf-sync';
import express, { type Request, type RequestHandler, type Response } from 'express';
import session from 'express-session';

import {
  APP_ID,
  APP_NAME,
  APP_PUBLIC_BASE_URL,
  APP_VERSION,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  SESSION_COOKIE_NAME,
  SESSION_SECRET,
  TRUST_PROXY,
  WOR_IMAGES_DIR,
  sessionCookieDomain,
} from './config.js';
import { getSessionDb } from './db/sessionDb.js';
import { SqliteSessionStore } from './db/sqliteSessionStore.js';
import { timingSafeEqualString } from './http/timingSafeEqual.js';
import { contentTypeForImagePath, isAllowedImageExtension } from './import/wor/images.js';
import { assertCodexReady } from './probes.js';
import { apiRouter } from './routes/api.js';
import { authRouter, issueCsrfToken } from './routes/auth.js';
import { bindClerkUserSessionMiddleware } from './session/bindClerkUserSession.js';

export interface CreateAppOptions {
  sessionDb?: ReturnType<typeof getSessionDb>;
  metricsMiddleware?: RequestHandler;
}

export interface AppBundle {
  app: express.Express;
  sessionStore: SqliteSessionStore;
}

const CSRF_IGNORED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createApp(options: CreateAppOptions = {}): AppBundle {
  const sessionDb = options.sessionDb ?? getSessionDb();
  const sessionStore = new SqliteSessionStore({
    db: sessionDb,
    cleanupIntervalMs: 15 * 60 * 1000,
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
    readiness: async () => {
      await assertCodexReady();
      return true;
    },
    mountBeforeApi(app) {
      app.use(compression());
      app.use(cookieParser());
    },
    installSession(app) {
      const cookieOptions: express.CookieOptions = {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: SECURE_COOKIES,
        sameSite: 'lax',
      };
      const cookieDomain = sessionCookieDomain();
      if (cookieDomain) cookieOptions.domain = cookieDomain;

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

      const { generateToken, getTokenFromRequest, getTokenFromState, invalidCsrfTokenError } =
        csrfSync({
          getTokenFromRequest: (req: Request) => {
            if (req.body?._csrf) return req.body._csrf as string;
            const header = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
            return (Array.isArray(header) ? header[0] : header) ?? null;
          },
          getTokenFromState: (req) => {
            const sessionData = req.session;
            if (!sessionData) return null;
            return sessionData.csrfToken ?? null;
          },
          storeTokenInState: (req, token) => {
            if (req.session) {
              req.session.csrfToken = token as string;
            }
          },
        });

      app.use((req, res, next) => {
        (req as Request & { csrfToken?: (overwrite?: boolean) => string }).csrfToken = (
          overwrite,
        ) => generateToken(req, overwrite);
        if (CSRF_IGNORED_METHODS.has(req.method.toUpperCase())) {
          next();
          return;
        }
        const received = getTokenFromRequest(req);
        const stored = getTokenFromState(req);
        if (
          typeof received === 'string' &&
          typeof stored === 'string' &&
          timingSafeEqualString(received, stored)
        ) {
          next();
          return;
        }
        next(invalidCsrfTokenError);
      });

      const isDevEnv = NODE_ENV !== 'production';
      const defaultDevOrigins = isDevEnv
        ? [
            'http://localhost',
            'http://127.0.0.1',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:4173',
            'http://127.0.0.1:4173',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
            'http://localhost:8080',
            'http://127.0.0.1:8080',
          ]
        : [];
      const configuredOrigins = [process.env.ALLOWED_APP_ORIGINS]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(',');
      const originCandidates = configuredOrigins
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const excludedOrigins: string[] = [];
      const allowedAppOrigins = [...new Set([...originCandidates, ...defaultDevOrigins])].filter(
        (value) => {
          const isHttps = value.startsWith('https://');
          const isDevHttp = isDevEnv && value.startsWith('http://');
          const allowed = isHttps || isDevHttp;
          if (!allowed) excludedOrigins.push(value);
          return allowed;
        },
      );
      if (excludedOrigins.length > 0) {
        console.warn('[CORS] Excluded app origins from ALLOWED_APP_ORIGINS:', excludedOrigins);
      }

      app.use((req: Request, res: Response, next) => {
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
          const allowedOrigins = new Set<string>([APP_PUBLIC_BASE_URL, ...allowedAppOrigins]);
          if (!allowedOrigins.has(origin)) {
            res.status(403).json({ error: 'Origin not allowed', code: 'CSRF_ORIGIN_INVALID' });
            return;
          }
        }

        next();
      });

      app.use((req: Request, res: Response, next) => {
        const origin = req.headers.origin;
        if (typeof origin === 'string' && allowedAppOrigins.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-XSRF-Token');
          res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
        }
        if (req.method === 'OPTIONS') {
          res.status(204).end();
          return;
        }
        next();
      });

      app.use('/api', (_req, res, next) => {
        res.setHeader('Cache-Control', 'no-store');
        next();
      });

      app.use(
        '/api',
        bindClerkUserSessionMiddleware(
          (req) => getClerkAuthState(req).userId,
          (req) => {
            (req as Request & { csrfToken?: (overwrite?: boolean) => string }).csrfToken?.(true);
          },
        ),
      );

      app.use(
        '/wor-images',
        (req, res, next) => {
          const ext = path.extname(req.path).toLowerCase();
          if (!isAllowedImageExtension(ext)) {
            res.status(404).end();
            return;
          }
          next();
        },
        express.static(WOR_IMAGES_DIR, {
          maxAge: '7d',
          setHeaders(res, filePath) {
            const contentType = contentTypeForImagePath(filePath);
            if (contentType) {
              res.setHeader('Content-Type', contentType);
            } else {
              res.setHeader('Content-Type', 'application/octet-stream');
              res.setHeader('Content-Disposition', 'attachment');
            }
            if (filePath.toLowerCase().endsWith('.svg')) {
              res.setHeader('Content-Security-Policy', "sandbox; script-src 'none'");
            }
            res.setHeader('X-Content-Type-Options', 'nosniff');
          },
        }),
      );

      app.get('/login', (_req, res) => {
        res.redirect('/sign-in');
      });
      app.get('/auth/login', (_req, res) => {
        res.redirect('/sign-in');
      });
      app.get('/auth/legal', (_req, res) => {
        res.redirect(LEGAL_PAGE_URL);
      });
    },
  });

  bundle.apiRouter.use('/auth', authRouter);
  bundle.apiRouter.get('/csrf', issueCsrfToken);
  bundle.apiRouter.use(apiRouter);
  return { app: bundle.app, sessionStore };
}

import fs from 'fs';
import path from 'path';

import type Database from 'better-sqlite3';
import { csrfSync } from 'csrf-sync';
import express, { type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import session from 'express-session';

import { clerkMiddleware, getClerkAuthState } from './auth/middleware.js';
import {
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
import { handleDalAppNavProxy } from './http/dalAppNavProxy.js';
import { createAppHelmet } from './http/helmetCsp.js';
import { getRequestId, requestIdMiddleware } from './http/requestId.js';
import { log } from './logger.js';
import { ingestRouter } from './metrics/ingestRoute.js';
import { apiRouter } from './routes/api.js';
import { bindClerkUserSessionMiddleware } from './session/bindClerkUserSession.js';

export interface AppBundle {
  app: express.Express;
  sessionDb: Database.Database;
  sessionStore: SqliteSessionStore;
}

export interface CreateAppOptions {
  sessionDb?: Database.Database;
  metricsMiddleware?: RequestHandler;
}

export function createApp(options: CreateAppOptions = {}): AppBundle {
  ensureDataDirs();
  const sessionDb = options.sessionDb ?? getSessionDb();
  const sessionStore = new SqliteSessionStore({ db: sessionDb });

  const app = express();

  if (TRUST_PROXY) app.set('trust proxy', 1);
  if (NODE_ENV === 'production' && SECURE_COOKIES && !TRUST_PROXY) {
    throw new Error('TRUST_PROXY must be enabled in production when SECURE_COOKIES is enabled.');
  }

  app.use(createAppHelmet());
  app.use(requestIdMiddleware);
  if (options.metricsMiddleware) {
    app.use(options.metricsMiddleware);
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  const baselineLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path === '/healthz' ||
      req.path === '/readyz' ||
      req.path === '/favicon.ico' ||
      req.path === '/favicon.png' ||
      req.path === '/favicon.svg' ||
      /^\/assets\/.+\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(req.path),
  });
  app.use(baselineLimiter);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', app: APP_NAME });
  });

  app.get('/readyz', (_req, res) => {
    try {
      sessionDb.prepare('SELECT 1').get();
      res.json({ status: 'ready', app: APP_NAME });
    } catch {
      res.status(503).json({ status: 'not_ready', app: APP_NAME });
    }
  });

  app.use(clerkMiddleware());

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

  // Token-auth ingest must sit above CSRF (agents have no session cookie).
  const ingestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/ingest', ingestLimiter, ingestRouter);

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

  app.use('/api', (req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const status = res.statusCode;
      if (status < 400) return;
      log(status >= 500 ? 'error' : 'warn', 'api_request', {
        requestId: getRequestId(res),
        method: req.method,
        path: req.originalUrl,
        status,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  const appApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const publicPageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1200,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const staticAssetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5000,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.get('/api/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: APP_VERSION });
  });

  app.get('/api/dal-app-nav', (req, res) => {
    void handleDalAppNavProxy(req, res);
  });

  app.use('/api', appApiLimiter, apiRouter);

  const faviconPng = path.join(PROJECT_ROOT, 'public', 'favicon.png');
  app.get('/favicon.png', publicPageLimiter, (_req, res) => {
    res.sendFile(faviconPng);
  });
  app.get('/favicon.ico', publicPageLimiter, (_req, res) => {
    res.sendFile(faviconPng);
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.get('/legal', publicPageLimiter, (_req, res) => {
    res.redirect(LEGAL_PAGE_URL);
  });

  if (NODE_ENV !== 'development') {
    const clientDir = path.join(PROJECT_ROOT, 'dist', 'client');
    const clientIndexPath = path.join(clientDir, 'index.html');
    let clientBuildPresent = fs.existsSync(clientIndexPath);
    if (!clientBuildPresent && NODE_ENV === 'production') {
      log('warn', 'Client build missing; page routes return 503 until `pnpm run build` runs.', {
        clientIndexPath,
      });
    }

    app.use(
      '/assets',
      staticAssetLimiter,
      express.static(path.join(clientDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }),
    );

    const spaFallback: express.RequestHandler = (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (!clientBuildPresent) {
        clientBuildPresent = fs.existsSync(clientIndexPath);
        if (!clientBuildPresent) {
          res.status(503).json({ error: 'Client build missing. Run `pnpm run build` first.' });
          return;
        }
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(clientIndexPath);
    };

    app.use(
      publicPageLimiter,
      express.static(clientDir, {
        maxAge: '1h',
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
      spaFallback,
    );
  }

  app.use(
    (err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const maybe = err as {
        statusCode?: unknown;
        status?: unknown;
        code?: unknown;
        expose?: unknown;
      };

      if (maybe.code === 'EBADCSRFTOKEN') {
        res.setHeader('X-CSRF-Error', '1');
        res.status(403).json({ error: 'Invalid CSRF token', code: 'CSRF_INVALID' });
        return;
      }

      const statusFromError =
        typeof maybe.statusCode === 'number'
          ? maybe.statusCode
          : typeof maybe.status === 'number'
            ? maybe.status
            : undefined;
      const status =
        statusFromError && statusFromError >= 400 && statusFromError < 600 ? statusFromError : 500;

      log('error', 'request_failed', {
        requestId: getRequestId(res),
        method: req.method,
        path: req.originalUrl,
        status,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });

      const expose = maybe.expose === true && err instanceof Error && status < 500;
      const message = expose
        ? err.message
        : status === 500
          ? 'Internal server error'
          : 'Request failed';
      res.status(status).json({ error: message });
    },
  );

  return { app, sessionDb, sessionStore };
}

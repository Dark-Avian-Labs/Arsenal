import fs from 'node:fs';
import path from 'node:path';

import express, { type Express, type RequestHandler, type Router } from 'express';
import { rateLimit } from 'express-rate-limit';

import { clerkMiddleware, rejectCrossSiteWrites } from './auth/middleware.js';
import { handleDalAppNavProxy } from './http/dalAppNavProxy.js';
import { createAppHelmet } from './http/helmetCsp.js';
import { getRequestId, requestIdMiddleware } from './http/requestId.js';
import { log } from './logger.js';

export interface CreateAppOptions {
  appName: string;
  appId: string;
  appVersion: string;
  projectRoot: string;
  nodeEnv: string;
  trustProxy: boolean;
  secureCookies: boolean;
  legalPageUrl: string;
  jsonLimit?: string;
  metricsMiddleware?: RequestHandler;
  readiness?: () => boolean | Promise<boolean>;
  rateLimits?: { api?: number; write?: number; page?: number; asset?: number };
  mountBeforeApi?: (app: Express) => void;
  /** App-specific mounts: rate limits, static files. Does not mount a session. */
  mount?: (app: Express) => void;
  helmet?: { hsts?: boolean; extraScriptSrc?: string[]; extraConnectSrc?: string[] };
}

export interface AppBundle {
  app: Express;
  apiRouter: Router;
  writeLimiter?: RequestHandler;
}

export function createApp(options: CreateAppOptions): AppBundle {
  const jsonLimit = options.jsonLimit ?? '100kb';
  const pageMax = options.rateLimits?.page ?? 1200;
  const apiMax = options.rateLimits?.api ?? 600;
  const assetMax = options.rateLimits?.asset ?? 5000;
  const ready = options.readiness ?? (() => true);

  const app = express();

  if (options.trustProxy) app.set('trust proxy', 1);
  if (options.nodeEnv === 'production' && options.secureCookies && !options.trustProxy) {
    throw new Error('TRUST_PROXY must be enabled in production when SECURE_COOKIES is enabled.');
  }

  app.use(createAppHelmet(options.helmet));
  app.use(requestIdMiddleware);
  if (options.metricsMiddleware) {
    app.use(options.metricsMiddleware);
  }

  options.mountBeforeApi?.(app);

  app.use(express.json({ limit: jsonLimit }));
  app.use(express.urlencoded({ extended: true, limit: jsonLimit }));

  const baselineLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: pageMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) =>
      req.path === '/healthz' ||
      req.path === '/readyz' ||
      req.path === '/api/version' ||
      req.path === '/favicon.ico' ||
      req.path === '/favicon.png' ||
      req.path === '/favicon.svg' ||
      /^\/assets\/.+\.(?:css|js|png|jpe?g|gif|webp|svg|ico|woff2?)$/i.test(req.path),
  });
  app.use(baselineLimiter);

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', app: options.appName });
  });

  app.get('/readyz', (_req, res, next) => {
    void Promise.resolve()
      .then(() => ready())
      .then((ok) => {
        if (res.headersSent) return;
        if (!ok) {
          res.status(503).json({ status: 'not_ready', app: options.appName });
          return;
        }
        res.json({ status: 'ready', app: options.appName });
      })
      .catch((err: unknown) => {
        if (res.headersSent) {
          next(err);
          return;
        }
        res.status(503).json({ status: 'not_ready', app: options.appName });
      });
  });

  app.use(clerkMiddleware());
  options.mount?.(app);

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
    max: apiMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const publicPageLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: pageMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const staticAssetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: assetMax,
    standardHeaders: true,
    legacyHeaders: false,
  });

  const writeLimiter =
    options.rateLimits?.write == null
      ? undefined
      : rateLimit({
          windowMs: 15 * 60 * 1000,
          max: options.rateLimits.write,
          standardHeaders: true,
          legacyHeaders: false,
        });

  app.get('/api/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: options.appVersion });
  });

  app.get('/api/dal-app-nav', (req, res) => {
    void handleDalAppNavProxy(req, res);
  });

  const apiRouter = express.Router();
  app.use('/api', appApiLimiter, rejectCrossSiteWrites, apiRouter);

  const faviconPng = path.join(options.projectRoot, 'public', 'favicon.png');
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
    res.redirect(options.legalPageUrl);
  });

  if (options.nodeEnv !== 'development') {
    const clientDir =
      options.nodeEnv !== 'production' && process.env.E2E_CLIENT_DIR?.trim()
        ? path.resolve(process.env.E2E_CLIENT_DIR.trim())
        : path.join(options.projectRoot, 'dist', 'client');
    const clientIndexPath = path.join(clientDir, 'index.html');
    let clientBuildPresent = fs.existsSync(clientIndexPath);
    if (!clientBuildPresent && options.nodeEnv === 'production') {
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

    const spaFallback: RequestHandler = (req, res, next) => {
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

  return { app, apiRouter, writeLimiter };
}

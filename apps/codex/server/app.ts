import path from 'path';

import { createApp as createKitApp } from '@dark-avian-labs/server-kit';
import express, { type Request, type RequestHandler, type Response } from 'express';

import {
  APP_ID,
  APP_NAME,
  APP_VERSION,
  LEGAL_PAGE_URL,
  NODE_ENV,
  PROJECT_ROOT,
  SECURE_COOKIES,
  TRUST_PROXY,
  WOR_IMAGES_DIR,
} from './config.js';
import { contentTypeForImagePath, isAllowedImageExtension } from './import/wor/images.js';
import { assertCodexReady } from './probes.js';
import { apiRouter } from './routes/api.js';
import { authRouter } from './routes/auth.js';

export interface CreateAppOptions {
  metricsMiddleware?: RequestHandler;
}

export interface AppBundle {
  app: express.Express;
}

export function createApp(options: CreateAppOptions = {}): AppBundle {
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
    installSession(app) {
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
        const origin = req.headers.origin;
        if (typeof origin === 'string' && allowedAppOrigins.includes(origin)) {
          res.setHeader('Access-Control-Allow-Origin', origin);
          res.setHeader('Vary', 'Origin');
          res.setHeader('Access-Control-Allow-Credentials', 'true');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  bundle.apiRouter.use(apiRouter);
  return { app: bundle.app };
}

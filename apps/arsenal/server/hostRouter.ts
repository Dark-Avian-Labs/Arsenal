import {
  createClerkWebhookRouter,
  log,
  type ClerkWebhookHandlers,
} from '@dark-avian-labs/server-kit';
import express, { type Express, type Request, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

export type MountedAppId = 'codex' | 'armory' | 'outfitter' | 'budget-planner';

export const MOUNTED_APP_IDS: readonly MountedAppId[] = [
  'codex',
  'armory',
  'outfitter',
  'budget-planner',
];

export interface HostRouterOptions {
  apps: Record<MountedAppId, Express>;
  appVersion: string;
  trustProxy: boolean;
  defaultApp?: MountedAppId;
  hostMap?: Record<string, MountedAppId>;
  allowHeaderOverride?: boolean;
  metricsMiddleware?: RequestHandler;
  webhookHandlers?: ClerkWebhookHandlers;
  readinessChecks?: Record<MountedAppId, () => boolean | Promise<boolean>>;
}

function normalizeHost(raw: string | undefined): string {
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim().toLowerCase() ?? '';
  return first.replace(/:\d+$/, '');
}

export function parseHostMapEnv(raw: string | undefined): Record<string, MountedAppId> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, MountedAppId> = {};
    for (const [host, target] of Object.entries(parsed)) {
      if (typeof target === 'string' && (MOUNTED_APP_IDS as readonly string[]).includes(target)) {
        out[normalizeHost(host)] = target as MountedAppId;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function resolveMountedAppId(
  req: Request,
  options: {
    hostMap: Record<string, MountedAppId>;
    defaultApp: MountedAppId;
    allowHeaderOverride: boolean;
  },
): MountedAppId {
  if (options.allowHeaderOverride) {
    const headerOverride = String(req.headers['x-arsenal-app'] ?? '')
      .trim()
      .toLowerCase();
    if ((MOUNTED_APP_IDS as readonly string[]).includes(headerOverride)) {
      return headerOverride as MountedAppId;
    }
  }

  const forwardedHost =
    typeof req.headers['x-forwarded-host'] === 'string'
      ? req.headers['x-forwarded-host']
      : undefined;
  const host = normalizeHost(forwardedHost || req.headers.host);

  if (host && options.hostMap[host]) {
    return options.hostMap[host];
  }

  const subdomain = host.split('.')[0] ?? '';
  if (subdomain === 'codex') return 'codex';
  if (subdomain === 'armory') return 'armory';
  if (subdomain === 'outfitter') return 'outfitter';
  if (subdomain === 'budget' || subdomain === 'budgetplanner' || subdomain === 'budget-planner') {
    return 'budget-planner';
  }

  return options.defaultApp;
}

export function createArsenalHostApp(options: HostRouterOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  if (options.trustProxy) app.set('trust proxy', 1);

  if (options.metricsMiddleware) {
    app.use(options.metricsMiddleware);
  }

  const defaultApp: MountedAppId = options.defaultApp ?? 'codex';
  const hostMap = options.hostMap ?? {};
  const allowHeaderOverride = options.allowHeaderOverride ?? true;

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, service: 'arsenal', apps: MOUNTED_APP_IDS });
  });

  app.get('/api/version', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ version: options.appVersion });
  });

  app.get('/readyz', async (_req, res) => {
    const checks = options.readinessChecks;
    if (!checks) {
      res.json({ ok: true });
      return;
    }
    const results: Record<string, boolean> = {};
    let allOk = true;
    for (const id of MOUNTED_APP_IDS) {
      const check = checks[id];
      if (!check) {
        results[id] = true;
        continue;
      }
      try {
        const ok = await check();
        results[id] = ok;
        if (!ok) allOk = false;
      } catch (err) {
        log('error', `Arsenal readiness failed for ${id}`, {
          err: err instanceof Error ? err.message : String(err),
        });
        results[id] = false;
        allOk = false;
      }
    }
    res.status(allOk ? 200 : 503).json({ ok: allOk, apps: results });
  });

  if (options.webhookHandlers) {
    const webhookLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 600,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(
      '/api/webhooks/clerk',
      webhookLimiter,
      express.raw({ type: 'application/json' }),
      createClerkWebhookRouter(options.webhookHandlers),
    );
  }

  app.use((req, res, next) => {
    const targetId = resolveMountedAppId(req, { hostMap, defaultApp, allowHeaderOverride });
    const target = options.apps[targetId];
    if (!target) {
      res.status(502).json({ error: `Unknown app target: ${targetId}` });
      return;
    }
    target(req, res, next);
  });

  return app;
}

import { validateBody } from '@dark-avian-labs/server-kit';
import { Router, type Response } from 'express';

import { NODE_ENV } from '../config.ts';
import { requireCodexAdmin } from '../core.ts';
import { getWorCatalogDb, worAdminImportRunSchema } from '../games/wor/index.ts';
import { ensureWorDbAvailable } from '../worDbState.ts';

export const worAdminApiRouter = Router();

function isCiCatalogMode(): boolean {
  const mode = process.env.CODEX_CATALOG_MODE?.trim().toLowerCase();
  if (mode === 'local') return false;
  if (mode === 'ci') return true;
  return NODE_ENV === 'production';
}

function worCatalogNeedsImportLightweight(): boolean {
  try {
    const row = getWorCatalogDb().prepare('SELECT COUNT(*) AS c FROM catalog_heroes').get() as
      | { c: number }
      | undefined;
    return !row || row.c === 0;
  } catch {
    return true;
  }
}

function idleSnapshot() {
  return {
    running: false,
    status: 'idle',
    mode: 'ci',
    message: 'Catalog scraping runs in Forgejo Actions (catalog-sync workflow).',
  };
}

function json(res: Response, data: object, status = 200): void {
  res.status(status).json(data);
}

function err(res: Response, message: string, status = 400): void {
  res.status(status).json({ error: message });
}

worAdminApiRouter.get('/import/status', requireCodexAdmin, async (_req, res) => {
  if (!ensureWorDbAvailable()) {
    err(res, 'WoR database unavailable', 503);
    return;
  }
  if (isCiCatalogMode()) {
    json(res, idleSnapshot());
    return;
  }
  const { getWorAdminImportSnapshot } = await import('../import/wor/adminImportJob.ts');
  json(res, getWorAdminImportSnapshot());
});

worAdminApiRouter.get('/import/stream', requireCodexAdmin, async (req, res) => {
  if (!ensureWorDbAvailable()) {
    err(res, 'WoR database unavailable', 503);
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  if (isCiCatalogMode()) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(idleSnapshot())}\n\n`);
    res.end();
    return;
  }

  const { getWorAdminImportSnapshot, subscribeWorAdminImport } =
    await import('../import/wor/adminImportJob.ts');

  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    unsubscribe();
  };

  const canWrite = () => !closed && !res.writableEnded && !res.writableFinished && res.writable;

  const send = (event: string, data: object) => {
    if (!canWrite()) {
      cleanup();
      return;
    }
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      cleanup();
    }
  };

  const unsubscribe = subscribeWorAdminImport((event) => {
    if ('snapshot' in event) {
      send('snapshot', event.snapshot);
      return;
    }
    for (const line of event.lines) send('line', line);
  });

  send('snapshot', getWorAdminImportSnapshot());
  heartbeat = setInterval(() => {
    if (!canWrite()) {
      cleanup();
      return;
    }
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, 15_000);

  req.on('close', () => {
    cleanup();
  });
});

worAdminApiRouter.post('/import/start', requireCodexAdmin, async (req, res) => {
  if (!ensureWorDbAvailable()) {
    err(res, 'WoR database unavailable', 503);
    return;
  }
  if (isCiCatalogMode()) {
    err(
      res,
      'In-server scraping is disabled in production. Trigger the Forgejo catalog-sync workflow instead.',
      409,
    );
    return;
  }
  const data = validateBody(worAdminImportRunSchema, req.body ?? {}, res);
  if (!data) return;
  const { isWorImportRunning, startWorAdminImport } =
    await import('../import/wor/adminImportJob.ts');
  if (isWorImportRunning()) {
    err(res, 'Import already running', 409);
    return;
  }
  const result = startWorAdminImport({
    forceImport: data.forceImport,
    forceImages: data.forceImages,
    forceSteps: data.forceSteps,
  });
  if (!result.started) {
    err(res, result.reason ?? 'Import could not start', 409);
    return;
  }
  json(res, { started: true, snapshot: result.snapshot }, 202);
});

worAdminApiRouter.get('/catalog/status', requireCodexAdmin, (_req, res) => {
  if (!ensureWorDbAvailable()) {
    err(res, 'WoR database unavailable', 503);
    return;
  }
  const needs = worCatalogNeedsImportLightweight();
  json(res, {
    needs_import: needs,
    has_catalog: !needs,
  });
});

worAdminApiRouter.post('/catalog/bootstrap', requireCodexAdmin, async (_req, res) => {
  if (!ensureWorDbAvailable()) {
    err(res, 'WoR database unavailable', 503);
    return;
  }
  if (isCiCatalogMode()) {
    err(
      res,
      'In-server scraping is disabled in production. Trigger the Forgejo catalog-sync workflow instead.',
      409,
    );
    return;
  }
  const { isWorImportRunning, startWorAdminImport } =
    await import('../import/wor/adminImportJob.ts');
  if (isWorImportRunning()) {
    err(res, 'Import already running', 409);
    return;
  }
  const result = startWorAdminImport();
  if (!result.started) {
    err(res, result.reason ?? 'Import could not start', 409);
    return;
  }
  json(res, { started: true, snapshot: result.snapshot }, 202);
});

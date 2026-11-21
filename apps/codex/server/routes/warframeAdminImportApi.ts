import { validateBody } from '@dark-avian-labs/server-kit';
import { Router, type Response } from 'express';
import { z } from 'zod';

import { parseForceSteps } from '../../shared/warframeImport/pipelineSteps.ts';
import { getClerkUserId } from '../auth/clerkUser.ts';
import { NODE_ENV } from '../config.ts';
import { requireCodexAdmin } from '../core.ts';
import { getCatalogDb } from '../import/warframe/db/connection.ts';

export const warframeAdminImportRouter = Router();

const warframeAdminImportRunSchema = z.object({
  forceImport: z.boolean().optional(),
  forceImages: z.boolean().optional(),
  forceSteps: z.array(z.string()).optional(),
});

function isCiCatalogMode(): boolean {
  const mode = process.env.CODEX_CATALOG_MODE?.trim().toLowerCase();
  if (mode === 'local') return false;
  if (mode === 'ci') return true;
  return NODE_ENV === 'production';
}

function warframeCatalogNeedsImportLightweight(): boolean {
  try {
    const row = getCatalogDb().prepare('SELECT COUNT(*) AS c FROM warframes').get() as
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

warframeAdminImportRouter.get('/import/status', requireCodexAdmin, async (_req, res) => {
  if (isCiCatalogMode()) {
    json(res, idleSnapshot());
    return;
  }
  const { getAdminImportSnapshot } = await import('../import/warframe/adminImportJob.ts');
  json(res, getAdminImportSnapshot());
});

warframeAdminImportRouter.get('/import/stream', requireCodexAdmin, async (req, res) => {
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

  const { getAdminImportSnapshot, subscribeAdminImportSnapshot } =
    await import('../import/warframe/adminImportJob.ts');

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

  const unsubscribe = subscribeAdminImportSnapshot((event) => {
    if ('snapshot' in event) {
      send('snapshot', event.snapshot);
      return;
    }
    for (const line of event.lines) send('line', line);
  });

  send('snapshot', getAdminImportSnapshot());
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

warframeAdminImportRouter.post('/import/start', requireCodexAdmin, async (req, res) => {
  if (isCiCatalogMode()) {
    err(
      res,
      'In-server scraping is disabled in production. Trigger the Forgejo catalog-sync workflow instead.',
      409,
    );
    return;
  }
  const data = validateBody(warframeAdminImportRunSchema, req.body ?? {}, res);
  if (!data) return;
  const { isAdminImportRunning, startAdminImportJob } =
    await import('../import/warframe/adminImportJob.ts');
  if (isAdminImportRunning()) {
    err(res, 'Import already running', 409);
    return;
  }
  const userId = getClerkUserId(req);
  if (!userId) {
    err(res, 'Not authenticated', 401);
    return;
  }
  const result = startAdminImportJob(userId, {
    forceImport: data.forceImport,
    forceImages: data.forceImages,
    forceSteps: parseForceSteps(data.forceSteps),
  });
  if (!result.started) {
    err(res, result.reason ?? 'Import could not start', 409);
    return;
  }
  json(res, { started: true, snapshot: result.snapshot }, 202);
});

warframeAdminImportRouter.post('/import/reset', requireCodexAdmin, async (_req, res) => {
  if (isCiCatalogMode()) {
    json(res, { ok: true, snapshot: idleSnapshot() });
    return;
  }
  const { resetAdminImportLock } = await import('../import/warframe/adminImportJob.ts');
  const result = resetAdminImportLock();
  if (!result.cleared) {
    err(res, result.reason ?? 'Import job is still running', 409);
    return;
  }
  json(res, { ok: true, snapshot: result.snapshot });
});

warframeAdminImportRouter.get('/catalog/status', requireCodexAdmin, (_req, res) => {
  const needs = warframeCatalogNeedsImportLightweight();
  json(res, {
    needs_import: needs,
    has_catalog: !needs,
  });
});

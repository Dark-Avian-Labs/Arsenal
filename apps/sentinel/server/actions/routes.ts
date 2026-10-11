import { requireAdmin } from '@dark-avian-labs/server-kit';
import { Router, type Request, type Response } from 'express';

import { isForgejoConfigured } from './client.ts';
import { getActionsDb } from './db.ts';
import { getSyncStatus, isActionsRange, listRuns, querySeries, summarizeRuns } from './query.ts';

export const actionsRouter = Router();

function readFilters(req: Request) {
  const rangeRaw = String(req.query.range ?? '24h');
  if (!isActionsRange(rangeRaw)) return null;
  return {
    workflow: typeof req.query.workflow === 'string' ? req.query.workflow : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
    repo: typeof req.query.repo === 'string' ? req.query.repo : undefined,
    range: rangeRaw,
  };
}

actionsRouter.get('/runs', requireAdmin, (req: Request, res: Response) => {
  const filters = readFilters(req);
  if (!filters) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  res.json({
    range: filters.range,
    runs: listRuns(getActionsDb(), filters),
  });
});

actionsRouter.get('/summary', requireAdmin, (req: Request, res: Response) => {
  const filters = readFilters(req);
  if (!filters) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  res.json({
    range: filters.range,
    summary: summarizeRuns(getActionsDb(), filters),
  });
});

actionsRouter.get('/series', requireAdmin, (req: Request, res: Response) => {
  const filters = readFilters(req);
  if (!filters) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  res.json({
    range: filters.range,
    points: querySeries(getActionsDb(), filters),
  });
});

actionsRouter.get('/sync', requireAdmin, (_req: Request, res: Response) => {
  res.json(getSyncStatus(getActionsDb(), isForgejoConfigured()));
});

import { Router, type Request, type Response } from 'express';

import { requireAdmin } from '../auth/middleware.js';
import { getMetricsDb } from './db.js';
import {
  getAppMeta,
  getLatestHost,
  listFleet,
  queryEventRates,
  queryEvents,
  queryHostSeries,
  queryHttpSeries,
  querySeries,
  type RangePreset,
} from './query.js';

export const fleetRouter = Router();

const PRESETS = new Set<RangePreset>(['1h', '6h', '24h', '7d', '30d', 'today']);

function readRange(req: Request): RangePreset | null {
  const range = String(req.query.range ?? '24h');
  return PRESETS.has(range as RangePreset) ? (range as RangePreset) : null;
}

fleetRouter.get('/', requireAdmin, (_req: Request, res: Response) => {
  const db = getMetricsDb();
  res.json({ apps: listFleet(db), host: getLatestHost(db) });
});

fleetRouter.get('/host', requireAdmin, (req: Request, res: Response) => {
  const range = readRange(req);
  if (!range) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  res.json({ range, points: queryHostSeries(getMetricsDb(), range) });
});

fleetRouter.get('/:appId', requireAdmin, (req: Request, res: Response) => {
  const appId = String(req.params.appId ?? '');
  const range = readRange(req);
  if (!range) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  const db = getMetricsDb();
  const meta = getAppMeta(db, appId);
  if (!meta) {
    res.status(404).json({ error: 'app not found' });
    return;
  }
  res.json({
    app: meta,
    range,
    points: querySeries(db, appId, range),
    http: queryHttpSeries(db, appId, range),
    eventRates: queryEventRates(db, appId, range),
    events: queryEvents(db, appId, range),
  });
});

fleetRouter.get('/:appId/series', requireAdmin, (req: Request, res: Response) => {
  const appId = String(req.params.appId ?? '');
  const range = readRange(req);
  if (!range) {
    res.status(400).json({ error: 'invalid range' });
    return;
  }
  res.json({
    appId,
    range,
    points: querySeries(getMetricsDb(), appId, range),
  });
});

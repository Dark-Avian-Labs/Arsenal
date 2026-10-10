import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { SENTINEL_INGEST_TOKEN } from '../config.js';
import { getMetricsDb } from './db.js';
import { parseIngestBody } from './ingestSchema.js';
import { writeIngestSamples } from './writer.js';

export const ingestRouter = Router();

function requireIngestToken(req: Request, res: Response, next: NextFunction): void {
  if (!SENTINEL_INGEST_TOKEN) {
    res.status(503).json({ error: 'Ingest token not configured' });
    return;
  }
  const header = req.headers.authorization;
  const bearer =
    typeof header === 'string' && header.startsWith('Bearer ')
      ? header.slice('Bearer '.length).trim()
      : '';
  const alt =
    typeof req.headers['x-sentinel-token'] === 'string' ? req.headers['x-sentinel-token'] : '';
  const token = bearer || alt;
  if (!token || token !== SENTINEL_INGEST_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

ingestRouter.post('/', requireIngestToken, (req: Request, res: Response) => {
  const parsed = parseIngestBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const written = writeIngestSamples(getMetricsDb(), parsed.value.samples);
  res.status(204).end();
  void written;
});

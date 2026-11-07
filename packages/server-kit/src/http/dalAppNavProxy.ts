import type { Request, Response } from 'express';

export const DAL_APP_NAV_UPSTREAM_URL = 'https://darkavianlabs.com/dal-app-nav.json';
const UPSTREAM_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 256 * 1024;

let cached: { body: Buffer; fetchedAt: number } | null = null;

export function resetDalAppNavCache(): void {
  cached = null;
}

function sendBody(res: Response, body: Buffer): void {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
}

export async function handleDalAppNavProxy(_req: Request, res: Response): Promise<void> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    sendBody(res, cached.body);
    return;
  }
  const upstreamUrl = process.env.DAL_APP_NAV_UPSTREAM_URL?.trim() || DAL_APP_NAV_UPSTREAM_URL;

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!response.ok || !response.body) throw new Error(`upstream status ${response.status}`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error('upstream body too large');
      chunks.push(chunk);
    }
    cached = { body: Buffer.concat(chunks), fetchedAt: Date.now() };
    sendBody(res, cached.body);
  } catch {
    if (cached) {
      sendBody(res, cached.body);
      return;
    }
    res.status(502).json({ error: 'dal-app-nav upstream unavailable' });
  }
}

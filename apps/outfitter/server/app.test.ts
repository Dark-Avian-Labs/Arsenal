import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppBundle } from './app.ts';

let tmpDir: string;
let bundle: AppBundle;
let closeAppDb: () => void;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outfitter-app-test-'));
  vi.stubEnv('APP_DB_PATH', path.join(tmpDir, 'outfitter.db'));
  vi.resetModules();
  const [{ createApp }, { closeAppDb: close }] = await Promise.all([import('./app.ts'), import('./db/appDb.ts')]);
  closeAppDb = close;
  bundle = createApp();
});

afterAll(() => {
  closeAppDb?.();
  vi.unstubAllEnvs();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('outfitter app wiring', () => {
  it('GET /readyz probes the isolated outfitter SQLite DB and /api/health responds ok', async () => {
    const ready = await request(bundle.app).get('/readyz').expect(200);
    expect(ready.body.status).toBe('ready');

    const health = await request(bundle.app).get('/api/health').expect(200);
    expect(health.body.status).toBe('ok');
    expect(health.headers['cache-control']).toBe('no-store');
  });

  it('includes wasm-unsafe-eval in CSP for client-side OCR (tesseract.js)', async () => {
    const res = await request(bundle.app).get('/healthz').expect(200);
    expect(res.headers['content-security-policy']).toContain("'wasm-unsafe-eval'");
  });

  it('enforces 2mb JSON body limit (accepts >100kb import payloads, rejects >2mb)', async () => {
    const medium = { data: 'x'.repeat(200 * 1024) };
    const mediumRes = await request(bundle.app)
      .post('/api/anything')
      .set('Authorization', 'Bearer test-token')
      .send(medium);
    expect(mediumRes.status).toBe(404);

    const big = { data: 'x'.repeat(3 * 1024 * 1024) };
    const bigRes = await request(bundle.app).post('/api/anything').send(big);
    expect(bigRes.status).toBe(413);
  });

  it('GET /api/auth/me returns 401 when unauthenticated', async () => {
    const res = await request(bundle.app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

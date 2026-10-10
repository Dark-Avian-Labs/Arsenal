import Database from 'better-sqlite3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.js';
import { createApp } from './app.js';
import { APP_NAME, APP_VERSION } from './config.js';

let bundle: AppBundle | undefined;
let appDb: Database.Database | undefined;

beforeAll(() => {
  appDb = new Database(':memory:');
  appDb.pragma('foreign_keys = ON');
  bundle = createApp({ appDb });
});

afterAll(() => {
  appDb?.close();
});

describe('health endpoints', () => {
  it('GET /healthz responds ok without creating a session cookie', async () => {
    const res = await request(bundle!.app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', app: APP_NAME });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('GET /readyz probes the app DB', async () => {
    const res = await request(bundle!.app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', app: APP_NAME });
  });

  it('GET /readyz returns 503 when a database probe fails', async () => {
    const downAppDb = new Database(':memory:');
    const down = createApp({ appDb: downAppDb });
    downAppDb.close();
    const res = await request(down.app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', app: APP_NAME });
  });

  it('GET /api/health responds ok', async () => {
    const res = await request(bundle!.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', app: APP_NAME });
  });

  it('GET /api/version returns the package version', async () => {
    const res = await request(bundle!.app).get('/api/version');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(APP_VERSION);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('security headers', () => {
  it('sets helmet headers including a CSP with Clerk origins', async () => {
    const res = await request(bundle!.app).get('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain('https://challenges.cloudflare.com');
    expect(res.headers['content-security-policy']).toContain('https://*.protect.clerk.com');
  });

  it('emits rate limit headers on API routes', async () => {
    const res = await request(bundle!.app).get('/api/health');
    const hasRateLimitHeader = Boolean(res.headers['ratelimit'] ?? res.headers['ratelimit-limit']);
    expect(hasRateLimitHeader).toBe(true);
  });
});

describe('cross-site writes', () => {
  it('rejects a cross-site POST', async () => {
    const res = await request(bundle!.app).post('/api/nope').set('Sec-Fetch-Site', 'cross-site').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Cross-site request rejected');
  });

  it('lets a same-site POST reach routing', async () => {
    const res = await request(bundle!.app).post('/api/nope').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

describe('auth endpoints (Clerk not configured in tests)', () => {
  it('GET /api/me responds 503 when Clerk is off', async () => {
    const res = await request(bundle!.app).get('/api/me');
    expect(res.status).toBe(503);
  });

  it('GET /api/auth/me responds 503 when Clerk is off and returns a request id', async () => {
    const res = await request(bundle!.app).get('/api/auth/me');
    expect(res.status).toBe(503);
    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});

describe('API 404 handling', () => {
  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(bundle!.app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });
});

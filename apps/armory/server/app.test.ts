import Database from 'better-sqlite3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';
import { APP_NAME, APP_VERSION } from './config.ts';
import { createMemoryUserDb } from './testing/memoryUserDb.ts';

let bundle: AppBundle | undefined;
let catalogDb: Database.Database | undefined;
let userDb: Database.Database | undefined;

beforeAll(() => {
  catalogDb = new Database(':memory:');
  catalogDb.pragma('foreign_keys = ON');
  userDb = createMemoryUserDb();
  bundle = createApp({
    catalogDb,
    userDb,
  });
});

afterAll(() => {
  catalogDb?.close();
  userDb?.close();
});

describe('health endpoints', () => {
  it('GET /healthz responds ok without creating a session cookie', async () => {
    const res = await request(bundle!.app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', app: APP_NAME });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('GET /readyz probes catalog and user DBs', async () => {
    const res = await request(bundle!.app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', app: APP_NAME });
  });

  it('GET /readyz returns 503 when a database probe fails', async () => {
    const down = createApp({
      catalogDb: {
        prepare: () => {
          throw new Error('catalog unavailable');
        },
      } as unknown as Database.Database,
      userDb,
    });
    const res = await request(down.app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', app: APP_NAME });
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
    const res = await request(bundle!.app).get('/api/auth/me');
    const hasRateLimitHeader = Boolean(res.headers['ratelimit'] ?? res.headers['ratelimit-limit']);
    expect(hasRateLimitHeader).toBe(true);
  });
});

describe('request IDs', () => {
  it('echoes a well-formed X-Request-Id', async () => {
    const res = await request(bundle!.app).get('/healthz').set('X-Request-Id', 'abc-123-def-456');
    expect(res.headers['x-request-id']).toBe('abc-123-def-456');
  });

  it('replaces a malformed X-Request-Id', async () => {
    const res = await request(bundle!.app).get('/healthz').set('X-Request-Id', 'bad id! <script>');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toBe('bad id! <script>');
  });
});

describe('cross-site writes', () => {
  it('rejects a cross-site POST', async () => {
    const res = await request(bundle!.app).post('/api/nope').set('Sec-Fetch-Site', 'cross-site').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Cross-site request rejected');
  });

  it('lets a same-site POST reach routing', async () => {
    const res = await request(bundle!.app).post('/api/nope').set('Authorization', 'Bearer test-token').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

describe('API 404 handling', () => {
  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(bundle!.app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

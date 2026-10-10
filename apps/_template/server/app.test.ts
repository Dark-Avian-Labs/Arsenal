import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';

let bundle: AppBundle;

beforeAll(() => {
  bundle = createApp();
});

describe('health endpoints', () => {
  it('GET /healthz responds ok without creating a session cookie', async () => {
    const res = await request(bundle.app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('GET /readyz responds ready', async () => {
    const res = await request(bundle.app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /api/health responds ok', async () => {
    const res = await request(bundle.app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/version returns the package version', async () => {
    const res = await request(bundle.app).get('/api/version');
    expect(res.status).toBe(200);
    expect(typeof res.body.version).toBe('string');
    expect(res.body.version.length).toBeGreaterThan(0);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('security headers', () => {
  it('sets helmet headers including a CSP with Clerk origins', async () => {
    const res = await request(bundle.app).get('/healthz');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).toContain('https://challenges.cloudflare.com');
    expect(res.headers['content-security-policy']).toContain('https://*.protect.clerk.com');
  });

  it('emits rate limit headers on API routes', async () => {
    const res = await request(bundle.app).get('/api/health');
    const hasRateLimitHeader = Boolean(res.headers['ratelimit'] ?? res.headers['ratelimit-limit']);
    expect(hasRateLimitHeader).toBe(true);
  });
});

describe('request IDs', () => {
  it('echoes a well-formed X-Request-Id', async () => {
    const res = await request(bundle.app).get('/healthz').set('X-Request-Id', 'abc-123-def-456');
    expect(res.headers['x-request-id']).toBe('abc-123-def-456');
  });

  it('replaces a malformed X-Request-Id', async () => {
    const res = await request(bundle.app).get('/healthz').set('X-Request-Id', 'bad id! <script>');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).not.toBe('bad id! <script>');
  });
});

describe('cross-site writes', () => {
  it('rejects a cross-site POST', async () => {
    const res = await request(bundle.app).post('/api/anything').set('Sec-Fetch-Site', 'cross-site').send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Cross-site request rejected');
  });

  it('lets a same-site POST reach routing', async () => {
    const res = await request(bundle.app).post('/api/anything').set('Authorization', 'Bearer test-token').send({});
    expect(res.status).toBe(404);
  });
});

describe('auth endpoints (Clerk not configured in tests)', () => {
  it('GET /api/auth/me responds 401 when signed out', async () => {
    const res = await request(bundle.app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('body limits', () => {
  it('rejects JSON bodies over 100kb', async () => {
    const bigPayload = { data: 'x'.repeat(150 * 1024) };
    const res = await request(bundle.app).post('/api/anything').send(bigPayload);
    expect(res.status).toBe(413);
  });
});

describe('API 404 handling', () => {
  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(bundle.app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });
});

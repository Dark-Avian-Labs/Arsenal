import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp, type CreateAppOptions } from './createApp.ts';
import { withServer } from './testing/index.ts';

describe('createApp', () => {
  let root = '';

  afterEach(() => {
    vi.unstubAllEnvs();
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = '';
  });

  function makeApp(overrides: Partial<CreateAppOptions> = {}) {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'server-kit-app-'));
    return createApp({
      appName: 'TestApp',
      appId: 'test',
      appVersion: '1.2.3',
      projectRoot: root,
      nodeEnv: 'test',
      trustProxy: false,
      secureCookies: false,
      legalPageUrl: 'https://example.com/legal',
      ...overrides,
    });
  }

  it('serves /healthz, /readyz, /api/version, security headers, request IDs, and API 404s', async () => {
    const { app, apiRouter } = makeApp();
    apiRouter.get('/private-check', (_req, res) => {
      res.json({ ok: true });
    });

    await withServer(app, async (baseUrl) => {
      const health = await fetch(`${baseUrl}/healthz`, {
        headers: { 'X-Request-Id': 'abc-123-def-456' },
      });
      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({ status: 'ok', app: 'TestApp' });
      expect(health.headers.get('set-cookie')).toBeNull();
      expect(health.headers.get('x-content-type-options')).toBe('nosniff');
      expect(health.headers.get('content-security-policy')).toContain("script-src 'self'");
      expect(health.headers.get('content-security-policy')).toContain('https://challenges.cloudflare.com');
      expect(health.headers.get('content-security-policy')).toContain('https://*.protect.clerk.com');
      expect(health.headers.get('x-request-id')).toBe('abc-123-def-456');

      const badId = await fetch(`${baseUrl}/healthz`, {
        headers: { 'X-Request-Id': 'bad id! <script>' },
      });
      expect(badId.headers.get('x-request-id')).toBeTruthy();
      expect(badId.headers.get('x-request-id')).not.toBe('bad id! <script>');

      const ready = await fetch(`${baseUrl}/readyz`);
      expect(ready.status).toBe(200);
      await expect(ready.json()).resolves.toEqual({ status: 'ready', app: 'TestApp' });

      const version = await fetch(`${baseUrl}/api/version`);
      expect(version.status).toBe(200);
      await expect(version.json()).resolves.toEqual({ version: '1.2.3' });
      expect(version.headers.get('cache-control')).toBe('no-store');
      expect(Boolean(version.headers.get('ratelimit') ?? version.headers.get('ratelimit-limit'))).toBe(true);

      const apiCheck = await fetch(`${baseUrl}/api/private-check`);
      expect(apiCheck.status).toBe(200);
      expect(apiCheck.headers.get('cache-control')).toBe('no-store');

      const missing = await fetch(`${baseUrl}/api/nope`);
      expect(missing.status).toBe(404);
      await expect(missing.json()).resolves.toEqual({ error: 'Not found' });
    });
  });

  it('returns 503 on /readyz when readiness returns false or throws', async () => {
    const failingFalse = makeApp({ readiness: () => false });
    await withServer(failingFalse.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/readyz`);
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ status: 'not_ready', app: 'TestApp' });
    });

    const failingThrow = makeApp({
      readiness: async () => {
        throw new Error('db offline');
      },
    });
    await withServer(failingThrow.app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/readyz`);
      expect(res.status).toBe(503);
    });
  });

  it('enforces JSON body limit, rejects cross-site writes, and redacts 500 errors while exposing 4xx', async () => {
    const { app, apiRouter } = makeApp({ jsonLimit: '10kb' });
    apiRouter.get('/boom-500', () => {
      throw new Error('secret database password');
    });
    apiRouter.get('/boom-400', () => {
      const err = new Error('Bad filter') as Error & { statusCode: number; expose: boolean };
      err.statusCode = 400;
      err.expose = true;
      throw err;
    });

    await withServer(app, async (baseUrl) => {
      const tooBig = await fetch(`${baseUrl}/api/anything`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token',
        },
        body: JSON.stringify({ data: 'x'.repeat(20 * 1024) }),
      });
      expect(tooBig.status).toBe(413);

      const crossSite = await fetch(`${baseUrl}/api/anything`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'cross-site' },
        body: '{}',
      });
      expect(crossSite.status).toBe(403);
      await expect(crossSite.json()).resolves.toEqual({ error: 'Cross-site request rejected' });

      const internal = await fetch(`${baseUrl}/api/boom-500`);
      expect(internal.status).toBe(500);
      await expect(internal.json()).resolves.toEqual({ error: 'Internal server error' });

      const exposed = await fetch(`${baseUrl}/api/boom-400`);
      expect(exposed.status).toBe(400);
      await expect(exposed.json()).resolves.toEqual({ error: 'Bad filter' });
    });
  });

  it('serves built favicon and SPA fallback, returning 404/503 when missing', async () => {
    const { app } = makeApp();

    await withServer(app, async (baseUrl) => {
      const missingFavicon = await fetch(`${baseUrl}/favicon.png`);
      expect(missingFavicon.status).toBe(404);

      const missingSpa = await fetch(`${baseUrl}/some-route`);
      expect(missingSpa.status).toBe(503);

      const clientDir = path.join(root, 'dist', 'client');
      fs.mkdirSync(clientDir, { recursive: true });
      fs.writeFileSync(path.join(clientDir, 'favicon.png'), Buffer.from([137, 80, 78, 71]));
      fs.writeFileSync(path.join(clientDir, 'index.html'), '<!doctype html><html><body>ok</body></html>');

      const png = await fetch(`${baseUrl}/favicon.png`);
      expect(png.status).toBe(200);
      expect(new Uint8Array(await png.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
      expect((await fetch(`${baseUrl}/favicon.ico`)).status).toBe(200);

      const spa = await fetch(`${baseUrl}/some-route`);
      expect(spa.status).toBe(200);
      expect(spa.headers.get('cache-control')).toBe('no-cache');
      expect(await spa.text()).toContain('<body>ok</body>');
    });
  });

  it('refuses to start in production when secureCookies is on without trustProxy, or without appId', () => {
    expect(() => makeApp({ nodeEnv: 'production', secureCookies: true, trustProxy: false })).toThrow(/TRUST_PROXY/);

    vi.stubEnv('APP_ID', '');
    expect(() => makeApp({ appId: '' })).toThrow(/appId/);
  });
});

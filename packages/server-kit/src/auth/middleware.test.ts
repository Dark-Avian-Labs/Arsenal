import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  userId: 'user_1' as string | null,
  sessionClaims: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({ userId: auth.userId, sessionClaims: auth.sessionClaims }),
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { withServer } from '../testing/index.ts';
import {
  getClerkAuthState,
  isClerkConfigured,
  rejectCrossSiteWrites,
  requireAdmin,
  requireAuthApi,
} from './middleware.ts';

describe('isClerkConfigured', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when both keys are empty', () => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    expect(isClerkConfigured()).toBe(false);
  });

  it('rejects bare prefixes, placeholders, and half-configured keys', () => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_abc');
    expect(() => isClerkConfigured()).toThrow(/FATAL/);

    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_live_abc');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_live_');
    expect(() => isClerkConfigured()).toThrow(/FATAL/);

    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_placeholder');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_abc');
    expect(() => isClerkConfigured()).toThrow(/FATAL/);

    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_abc');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    expect(() => isClerkConfigured()).toThrow(/FATAL/);
  });
});

describe('auth and write middleware', () => {
  afterEach(() => {
    auth.userId = 'user_1';
    auth.sessionClaims = undefined;
    vi.unstubAllEnvs();
  });

  function app() {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_abc');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_abc');
    const server = express();
    server.locals.appId = 'armory';
    server.use(rejectCrossSiteWrites);
    server.get('/read', requireAuthApi, (_req, res) => {
      res.json({ ok: true });
    });
    server.get('/admin', requireAdmin, (_req, res) => {
      res.json({ admin: true });
    });
    server.get('/state', (req, res) => {
      res.json(getClerkAuthState(req));
    });
    server.post('/write', requireAuthApi, (_req, res) => {
      res.json({ ok: true });
    });
    server.post('/write-unguarded', (_req, res) => {
      res.json({ ok: true });
    });
    return server;
  }

  it('rejects cookie-only writes and cross-site writes, and allows bearer writes and signed-in reads', async () => {
    await withServer(app(), async (baseUrl) => {
      expect((await fetch(`${baseUrl}/write-unguarded`, { method: 'POST' })).status).toBe(401);
      expect((await fetch(`${baseUrl}/read`)).status).toBe(200);

      const cookiePost = await fetch(`${baseUrl}/write`, { method: 'POST' });
      expect(cookiePost.status).toBe(401);
      await expect(cookiePost.json()).resolves.toEqual({
        error: 'Bearer token required for write requests',
      });

      const bearerPost = await fetch(`${baseUrl}/write`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(bearerPost.status).toBe(200);

      const crossSite = await fetch(`${baseUrl}/write`, {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site', Authorization: 'Bearer test-token' },
      });
      expect(crossSite.status).toBe(403);
      await expect(crossSite.json()).resolves.toEqual({ error: 'Cross-site request rejected' });
    });
  });

  it('enforces requireAuthApi 401 and requireAdmin 401/403/200 using app.locals.appId', async () => {
    await withServer(app(), async (baseUrl) => {
      auth.userId = null;
      expect((await fetch(`${baseUrl}/read`)).status).toBe(401);
      expect((await fetch(`${baseUrl}/admin`)).status).toBe(401);

      auth.userId = 'user_1';
      auth.sessionClaims = { metadata: { apps: { codex: 'admin' } } };
      expect((await fetch(`${baseUrl}/admin`)).status).toBe(403);

      auth.sessionClaims = { metadata: { apps: { armory: 'admin' } } };
      expect((await fetch(`${baseUrl}/admin`)).status).toBe(200);
      await expect((await fetch(`${baseUrl}/state`)).json()).resolves.toEqual({
        authenticated: true,
        userId: 'user_1',
        isAdmin: true,
      });
    });
  });
});

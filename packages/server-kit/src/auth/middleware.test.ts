import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ userId: 'user_1' as string | null }));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({ userId: auth.userId, sessionClaims: undefined }),
  clerkMiddleware: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { withServer } from '../testing/index.ts';
import { isClerkConfigured, rejectCrossSiteWrites, requireAuthApi } from './middleware.ts';

describe('isClerkConfigured', () => {
  const previousPublishable = process.env.CLERK_PUBLISHABLE_KEY;
  const previousSecret = process.env.CLERK_SECRET_KEY;

  afterEach(() => {
    if (previousPublishable === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
    else process.env.CLERK_PUBLISHABLE_KEY = previousPublishable;
    if (previousSecret === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = previousSecret;
  });

  it('returns false when both keys are empty', () => {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    expect(isClerkConfigured()).toBe(false);
  });

  it('rejects bare pk_test_ and sk_test_ prefixes', () => {
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_';
    process.env.CLERK_SECRET_KEY = 'sk_test_abc';
    expect(() => isClerkConfigured()).toThrow(/FATAL/);
  });

  it('rejects a secret that is only sk_live_', () => {
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_live_abc';
    process.env.CLERK_SECRET_KEY = 'sk_live_';
    expect(() => isClerkConfigured()).toThrow(/FATAL/);
  });
});

describe('write guard', () => {
  const previousPublishable = process.env.CLERK_PUBLISHABLE_KEY;
  const previousSecret = process.env.CLERK_SECRET_KEY;

  afterEach(() => {
    auth.userId = 'user_1';
    if (previousPublishable === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
    else process.env.CLERK_PUBLISHABLE_KEY = previousPublishable;
    if (previousSecret === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = previousSecret;
  });

  function app() {
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_abc';
    process.env.CLERK_SECRET_KEY = 'sk_test_abc';
    const server = express();
    server.use(rejectCrossSiteWrites);
    server.get('/read', requireAuthApi, (_req, res) => {
      res.json({ ok: true });
    });
    server.post('/write', requireAuthApi, (_req, res) => {
      res.json({ ok: true });
    });
    server.post('/write-unguarded', (_req, res) => {
      res.json({ ok: true });
    });
    return server;
  }

  it('rejects a cookie-only POST even when the route has no auth guard', async () => {
    await withServer(app(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/write-unguarded`, { method: 'POST' });
      expect(res.status).toBe(401);
    });
  });

  it('allows a signed-in GET without a bearer token', async () => {
    await withServer(app(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/read`);
      expect(res.status).toBe(200);
    });
  });

  it('rejects a cookie-only POST', async () => {
    await withServer(app(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/write`, { method: 'POST' });
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({
        error: 'Bearer token required for write requests',
      });
    });
  });

  it('allows a POST with a bearer token', async () => {
    await withServer(app(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/write`, {
        method: 'POST',
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(res.status).toBe(200);
    });
  });

  it('rejects a cross-site POST', async () => {
    await withServer(app(), async (baseUrl) => {
      const res = await fetch(`${baseUrl}/write`, {
        method: 'POST',
        headers: { 'Sec-Fetch-Site': 'cross-site', Authorization: 'Bearer test-token' },
      });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'Cross-site request rejected' });
    });
  });
});

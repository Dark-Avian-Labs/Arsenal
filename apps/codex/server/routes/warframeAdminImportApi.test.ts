import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  userId: null as string | null,
  sessionClaims: undefined as Record<string, unknown> | undefined,
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({ userId: authState.userId, sessionClaims: authState.sessionClaims }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { warframeAdminImportRouter } from './warframeAdminImportApi.ts';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/warframe/admin', warframeAdminImportRouter);
  return app;
}

describe('warframeAdminImportRouter CI catalog mode', () => {
  beforeEach(() => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_codex');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_codex');
    vi.stubEnv('CODEX_CATALOG_MODE', 'ci');
    authState.userId = 'user_admin';
    authState.sessionClaims = { metadata: { apps: { codex: 'admin' } } };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects non-admin callers with 403', async () => {
    authState.sessionClaims = { metadata: { apps: { codex: 'user' } } };
    const res = await request(createApp()).get('/api/warframe/admin/import/status');
    expect(res.status).toBe(403);
  });

  it('returns 409 on POST /import/start and idle CI snapshots on status/stream/reset', async () => {
    const app = createApp();

    const start = await request(app).post('/api/warframe/admin/import/start').send({});
    expect(start.status).toBe(409);
    expect(start.body.error).toMatch(/disabled in production/i);

    const status = await request(app).get('/api/warframe/admin/import/status').expect(200);
    expect(status.body).toMatchObject({ running: false, status: 'idle', mode: 'ci' });

    const stream = await request(app).get('/api/warframe/admin/import/stream').expect(200);
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.text).toContain('"mode":"ci"');

    const reset = await request(app).post('/api/warframe/admin/import/reset').expect(200);
    expect(reset.body).toMatchObject({ ok: true, snapshot: { mode: 'ci' } });
  });
});

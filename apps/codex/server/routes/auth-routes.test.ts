import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({
  userId: null as string | null,
  sessionClaims: undefined as Record<string, unknown> | undefined,
}));

const dbMocks = vi.hoisted(() => ({
  warframeOk: true,
  epic7Ok: true,
  worOk: true,
  catalogDbPath: '',
  worCatalogDbPath: '',
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({ userId: authState.userId, sessionClaims: authState.sessionClaims }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../config.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.ts')>();
  return {
    ...actual,
    get WARFRAME_CATALOG_DB_PATH() {
      return dbMocks.catalogDbPath;
    },
    get WOR_CATALOG_DB_PATH() {
      return dbMocks.worCatalogDbPath;
    },
  };
});

vi.mock('../games/warframe/index.ts', () => ({
  getWarframeDb: () => ({
    prepare: () => ({
      get: () => {
        if (!dbMocks.warframeOk) throw new Error('warframe db unavailable');
        return { ok: 1 };
      },
    }),
  }),
}));

vi.mock('../games/epic7/index.ts', () => ({
  getEpic7Db: () => ({
    prepare: () => ({
      get: () => {
        if (!dbMocks.epic7Ok) throw new Error('epic7 db unavailable');
        return { ok: 1 };
      },
    }),
  }),
}));

vi.mock('../games/wor/index.ts', () => ({
  getWorDb: () => ({
    prepare: () => ({
      get: () => {
        if (!dbMocks.worOk) throw new Error('wor db unavailable');
        return { ok: 1 };
      },
    }),
  }),
}));

vi.mock('../epic7DbState.ts', () => ({
  refreshEpic7DbAvailability: async () => {},
  isEpic7DbAvailable: () => dbMocks.epic7Ok,
  ensureEpic7DbAvailable: () => dbMocks.epic7Ok,
}));

vi.mock('../worDbState.ts', () => ({
  refreshWorDbAvailability: async () => {},
  isWorDbAvailable: () => dbMocks.worOk,
  ensureWorDbAvailable: () => dbMocks.worOk,
}));

import { APP_NAME } from '../config.ts';
import { healthzHandler, readyzHandler } from '../probes.ts';
import { testRateLimiter } from '../testing/testExpress.ts';
import { authRouter } from './auth.ts';

function createProbeApp() {
  const app = express();
  app.use(testRateLimiter);
  app.use(express.json());
  app.get('/healthz', healthzHandler);
  app.get('/readyz', readyzHandler);
  app.use('/api/auth', authRouter);
  return app;
}

function writeEmptySqlite(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new SqliteDatabase(filePath);
  db.close();
}

describe('Codex auth and probe routes', () => {
  const tmpRoot = path.join(os.tmpdir(), `codex-auth-routes-${process.pid}`);

  beforeEach(() => {
    authState.userId = null;
    authState.sessionClaims = undefined;
    dbMocks.warframeOk = true;
    dbMocks.epic7Ok = true;
    dbMocks.worOk = true;
    dbMocks.catalogDbPath = '';
    dbMocks.worCatalogDbPath = '';
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(tmpRoot, { recursive: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('GET /healthz and /readyz report healthy when databases respond', async () => {
    const app = createProbeApp();
    await request(app).get('/healthz').expect(200, { status: 'ok', app: APP_NAME });
    const ready = await request(app).get('/readyz').expect(200);
    expect(ready.body).toMatchObject({ status: 'ready', app: APP_NAME });
  });

  it('GET /readyz returns 503 when warframe DB or Warframe/WoR catalog DBs fail checks', async () => {
    const app = createProbeApp();

    dbMocks.warframeOk = false;
    expect((await request(app).get('/readyz')).status).toBe(503);
    dbMocks.warframeOk = true;

    dbMocks.catalogDbPath = path.join(tmpRoot, 'missing-warframe-catalog.db');
    expect((await request(app).get('/readyz')).status).toBe(503);

    const emptyWf = path.join(tmpRoot, 'empty-warframe-catalog.db');
    writeEmptySqlite(emptyWf);
    dbMocks.catalogDbPath = emptyWf;
    expect((await request(app).get('/readyz')).status).toBe(503);
    dbMocks.catalogDbPath = '';

    const emptyWor = path.join(tmpRoot, 'empty-wor-catalog.db');
    writeEmptySqlite(emptyWor);
    dbMocks.worCatalogDbPath = emptyWor;
    expect((await request(app).get('/readyz')).status).toBe(503);
  });

  it('GET /api/auth/me returns 401 signed out and user/admin payload when signed in', async () => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_codex');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_codex');
    const app = createProbeApp();

    expect((await request(app).get('/api/auth/me')).status).toBe(401);

    authState.userId = 'user_admin';
    authState.sessionClaims = { metadata: { apps: { codex: 'admin' } } };
    const signedIn = await request(app).get('/api/auth/me').expect(200);
    expect(signedIn.body).toMatchObject({
      authenticated: true,
      userId: 'user_admin',
      isAdmin: true,
      isCodexAdmin: true,
    });
  });
});

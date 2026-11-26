import fs from 'node:fs';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest';

const authState = vi.hoisted(() => ({
  userId: null as string | null,
  sessionClaims: undefined as Record<string, unknown> | undefined,
}));

const dbState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createWarframeTestDb> | null,
  dbPath: '',
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({
    userId: authState.userId,
    sessionClaims: authState.sessionClaims,
  }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../games/warframe/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../games/warframe/index.ts')>();
  return {
    ...actual,
    getWarframeDb: () => {
      if (!dbState.db) throw new Error('Test DB not initialized');
      return dbState.db.db;
    },
    get WARFRAME_DB_PATH() {
      return dbState.dbPath;
    },
  };
});

import { ensureWarframeRowOrphanColumn } from '../games/warframe/db/schema.ts';
import { describeWithSqlite } from '../testing/describeWithSqlite.ts';
import {
  createTempDbDir,
  createWarframeTestDb,
  removeTempDbDir,
  seedMinimalWarframeFixture,
} from '../testing/sqliteTestHarness.ts';
import { apiRouter } from './api.ts';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  return app;
}

function cleanupTempDb(clearState = false): void {
  const harness = dbState.db;
  if (!harness) return;
  harness.closeDb();
  removeTempDbDir(harness.tmpDir);
  if (clearState) {
    dbState.db = null;
  }
}

describeWithSqlite('warframe API routes', () => {
  let accessSpy: MockInstance | undefined;
  let fixture: ReturnType<typeof seedMinimalWarframeFixture>;

  beforeEach(() => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_abc');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_abc');
    authState.userId = null;
    authState.sessionClaims = undefined;
    cleanupTempDb();
    const { dbPath } = createTempDbDir('codex-api-');
    dbState.dbPath = dbPath;
    dbState.db = createWarframeTestDb(dbPath);
    ensureWarframeRowOrphanColumn(dbState.db.db);
    fixture = seedMinimalWarframeFixture(dbState.db.db, 'user_test');
    accessSpy = vi.spyOn(fs.promises, 'access').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    accessSpy?.mockRestore();
    cleanupTempDb(true);
  });

  it('returns 401 for unauthenticated /api/status and 403 for non-admin admin cell patch', async () => {
    const app = createTestApp();
    const statusRes = await request(app).get('/api/status');
    expect(statusRes.status).toBe(401);
    expect(statusRes.body).toEqual({ error: 'Unauthorized' });

    authState.userId = 'user_test';
    authState.sessionClaims = { metadata: { apps: { codex: 'user' } } };
    const adminRes = await request(app)
      .patch('/api/warframe/admin/cells')
      .set('Authorization', 'Bearer test-token')
      .send({ row_id: fixture.rowId, column_id: fixture.columnId, value: 'Unavailable' });
    expect(adminRes.status).toBe(403);
  });

  it('rejects invalid cell patch bodies and invalid status enums', async () => {
    authState.userId = 'user_test';
    const app = createTestApp();

    const badBody = await request(app)
      .patch('/api/warframe/cells')
      .set('Authorization', 'Bearer test-token')
      .send({ row_id: 'bad', column_id: 1, value: 'Obtained' });
    expect(badBody.status).toBe(400);
    expect(badBody.body.error).toBe('Validation failed');

    const badStatus = await request(app)
      .patch('/api/warframe/cells')
      .set('Authorization', 'Bearer test-token')
      .send({ row_id: fixture.rowId, column_id: fixture.columnId, value: 'NotARealStatus' });
    expect(badStatus.status).toBe(400);
    expect(badStatus.body.error).toMatch(/Invalid status/i);
  });

  it('lists worksheets and updates cells while blocking non-admin edits on Unavailable cells', async () => {
    authState.userId = 'user_test';
    const app = createTestApp();

    const sheets = await request(app)
      .get('/api/warframe/worksheets')
      .set('Authorization', 'Bearer test-token')
      .expect(200);
    expect(sheets.body.worksheets.some((w: { id: number }) => w.id === fixture.worksheetId)).toBe(true);

    // Valid cell transition succeeds.
    await request(app)
      .patch('/api/warframe/cells')
      .set('Authorization', 'Bearer test-token')
      .send({ row_id: fixture.rowId, column_id: fixture.columnId, value: 'Obtained' })
      .expect(200);

    // Non-admin cannot set a cell to Unavailable.
    const toUnavailable = await request(app)
      .patch('/api/warframe/cells')
      .set('Authorization', 'Bearer test-token')
      .send({ row_id: fixture.rowId, column_id: fixture.columnId, value: 'Unavailable' });
    expect(toUnavailable.status).toBe(400);

    // Once marked Unavailable, non-admin cannot overwrite it either.
    dbState
      .db!.db.prepare('UPDATE cell_values SET value = ? WHERE row_id = ? AND column_id = ?')
      .run('Unavailable', fixture.rowId, fixture.columnId);
    const overwriteUnavailable = await request(app)
      .patch('/api/warframe/cells')
      .set('Authorization', 'Bearer test-token')
      .send({ row_id: fixture.rowId, column_id: fixture.columnId, value: 'Obtained' });
    expect(overwriteUnavailable.status).toBe(400);
  });

  it('only allows deleting orphan rows on DELETE /api/warframe/rows/:rowId', async () => {
    authState.userId = 'user_test';
    const app = createTestApp();

    // Non-orphan row is rejected with 404 (not deletable).
    const nonOrphan = await request(app)
      .delete(`/api/warframe/rows/${fixture.rowId}`)
      .set('Authorization', 'Bearer test-token');
    expect(nonOrphan.status).toBe(404);

    // Mark row as orphan, then deletion succeeds.
    dbState.db!.db.prepare('UPDATE rows SET orphaned = 1 WHERE id = ?').run(fixture.rowId);
    await request(app)
      .delete(`/api/warframe/rows/${fixture.rowId}`)
      .set('Authorization', 'Bearer test-token')
      .expect(200);
  });
});

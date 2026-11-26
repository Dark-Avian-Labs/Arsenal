import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createSchema as createEpic7Schema } from '../games/epic7/db/schema.ts';
import { epic7Queries as q } from '../games/epic7/index.ts';
import { describeWithSqlite } from '../testing/describeWithSqlite.ts';

const authState = vi.hoisted(() => ({
  userId: null as string | null,
}));

const dbState = vi.hoisted(() => ({
  db: null as SqliteDatabase | null,
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({ userId: authState.userId }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../epic7DbState.ts', () => ({
  isEpic7DbAvailable: () => true,
  ensureEpic7DbAvailable: () => true,
}));

vi.mock('../games/epic7/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../games/epic7/index.ts')>();
  return {
    ...actual,
    getEpic7Db: () => {
      if (!dbState.db) throw new Error('Test DB not initialized');
      return dbState.db;
    },
  };
});

import { epic7ApiRouter } from './epic7Api.ts';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/epic7', epic7ApiRouter);
  return app;
}

describeWithSqlite('Epic7 account and hero isolation', () => {
  beforeEach(() => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_epic7');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_epic7');
    authState.userId = null;
    dbState.db?.close();
    dbState.db = new SqliteDatabase(':memory:');
    createEpic7Schema(dbState.db);
    const accA = q.createGameAccount(dbState.db, 'user_a', 'Account A', true);
    const accB = q.createGameAccount(dbState.db, 'user_b', 'Account B', true);

    // Seed distinct heroes on user_a and user_b so cross-user leakage is caught.
    dbState.db
      .prepare('INSERT INTO account_heroes (account_id, name, class, element, star_rating) VALUES (?, ?, ?, ?, ?)')
      .run(accA, 'Arbiter Vildred', 'Thief', 'Dark', 5);
    dbState.db
      .prepare('INSERT INTO account_heroes (account_id, name, class, element, star_rating) VALUES (?, ?, ?, ?, ?)')
      .run(accB, 'Ras', 'Knight', 'Fire', 3);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    dbState.db?.close();
    dbState.db = null;
  });

  it('scopes hero reads and account switching strictly to the authenticated user', async () => {
    const app = createTestApp();

    authState.userId = 'user_a';
    const heroesA = await request(app).get('/api/epic7/heroes').expect(200);
    expect(heroesA.body.heroes.map((h: { name: string }) => h.name)).toEqual(['Arbiter Vildred']);

    authState.userId = 'user_b';
    const heroesB = await request(app).get('/api/epic7/heroes').expect(200);
    expect(heroesB.body.heroes.map((h: { name: string }) => h.name)).toEqual(['Ras']);

    // user_b cannot switch to user_a's account (id 1).
    const badSwitch = await request(app).post('/api/epic7/accounts/switch').send({ account_id: 1 });
    expect(badSwitch.status).toBe(400);

    const accountsB = await request(app).get('/api/epic7/accounts').expect(200);
    expect(accountsB.body.current_account_id).toBe(2);
    expect(accountsB.body.accounts.map((a: { id: number }) => a.id)).toEqual([2]);
  });
});

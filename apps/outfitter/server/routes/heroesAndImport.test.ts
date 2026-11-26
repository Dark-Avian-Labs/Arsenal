import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbState = vi.hoisted(() => ({
  db: null as SqliteDatabase | null,
}));

vi.mock('@clerk/express', () => ({
  getAuth: () => ({ userId: 'u1' }),
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../db/appDb.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/appDb.ts')>();
  return {
    ...actual,
    getAppDb: () => dbState.db!,
  };
});

import { createAppSchema } from '../db/appDb.ts';
import * as q from '../db/queries.ts';
import { heroesRouter } from './heroes.ts';
import { importRouter } from './import.ts';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/heroes', heroesRouter);
  app.use('/api/import', importRouter);
  return app;
}

describe('Outfitter hero stats & import routes', () => {
  let accountId: number;

  beforeEach(() => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'pk_test_outfitter');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_outfitter');
    dbState.db?.close();
    dbState.db = new SqliteDatabase(':memory:');
    createAppSchema(dbState.db);
    accountId = Number(
      dbState.db
        .prepare(`INSERT INTO game_accounts (clerk_user_id, account_name, is_active) VALUES ('u1', 'main', 1)`)
        .run().lastInsertRowid,
    );
    dbState.db
      .prepare(
        `INSERT INTO catalog_heroes (slug, name, class, faction, rarity, star_rating, base_hp, base_atk, base_def)
         VALUES ('silas', 'Silas', 'marksman', 'piercers', 'legendary', 5, 10000, 3000, 800)`,
      )
      .run();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    dbState.db?.close();
    dbState.db = null;
  });

  it('PATCH /api/heroes/:slug/stats rejects null/empty coercions to 0 and saves valid numbers', async () => {
    const app = createTestApp();

    // null or empty string must NOT coerce to 0 via Number(null) === 0
    const nullRes = await request(app)
      .patch('/api/heroes/silas/stats')
      .send({ hp: null, atk: 3200, def: 800, atk_interval: 2.5, rr_auto: 10, rr_attack: 8, rr_attacked: 5 });
    expect(nullRes.status).toBe(400);

    const emptyRes = await request(app)
      .patch('/api/heroes/silas/stats')
      .send({ hp: 10500, atk: '', def: 800, atk_interval: 2.5, rr_auto: 10, rr_attack: 8, rr_attacked: 5 });
    expect(emptyRes.status).toBe(400);

    const ok = await request(app)
      .patch('/api/heroes/silas/stats')
      .send({ hp: 10500, atk: 3200, def: 850, atk_interval: 2.4, rr_auto: 11, rr_attack: 9, rr_attacked: 6 })
      .expect(200);
    expect(ok.body.hero).toMatchObject({ slug: 'silas', hp: 10500, atk: 3200, def: 850 });
  });

  it('POST /api/import/preview and POST /api/import respect delete_missing guard when gear_plus_16_only is true', async () => {
    const app = createTestApp();
    // Seed one imported piece (with game_uid) and one manual piece (no game_uid)
    q.insertGear(dbState.db!, accountId, {
      slot: 'weapon',
      set_key: 'calamity',
      prefix: 'none',
      main_stat: 'atk',
      main_value: 1056,
      main_bonus: 0,
      substats: [],
      exclusive_hero_slug: null,
      exclusive_faction: null,
      game_uid: 'game-uid-1',
    });
    q.insertGear(dbState.db!, accountId, {
      slot: 'armor',
      set_key: 'calamity',
      prefix: 'none',
      main_stat: 'hp',
      main_value: 3000,
      main_bonus: 0,
      substats: [],
      exclusive_hero_slug: null,
      exclusive_faction: null,
    });

    const emptyFile = { gear: [], artifacts: [] };

    const previewPlus16 = await request(app)
      .post('/api/import/preview')
      .send({ file: emptyFile, gear_mode: 'sync', artifact_mode: 'skip', gear_plus_16_only: true })
      .expect(200);
    expect(previewPlus16.body.gear.missing).toHaveLength(0);

    const previewAll = await request(app)
      .post('/api/import/preview')
      .send({ file: emptyFile, gear_mode: 'sync', artifact_mode: 'skip', gear_plus_16_only: false })
      .expect(200);
    expect(previewAll.body.gear.missing).toHaveLength(2);

    // With gear_plus_16_only: true, delete_missing: true MUST NOT delete stash pieces!
    const syncGuarded = await request(app)
      .post('/api/import')
      .send({
        file: emptyFile,
        gear_mode: 'sync',
        artifact_mode: 'skip',
        gear_plus_16_only: true,
        delete_missing: true,
      })
      .expect(200);
    expect(syncGuarded.body.gear).toBe(2);

    // With gear_plus_16_only: false and delete_missing: true, missing stash pieces ARE deleted.
    const syncDeleted = await request(app)
      .post('/api/import')
      .send({
        file: emptyFile,
        gear_mode: 'sync',
        artifact_mode: 'skip',
        gear_plus_16_only: false,
        delete_missing: true,
      })
      .expect(200);
    expect(syncDeleted.body.gear).toBe(0);
  });
});

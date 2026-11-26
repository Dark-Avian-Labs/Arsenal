import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';
import { APP_NAME, LEGAL_PAGE_URL } from './config.ts';
import { createMemoryUserDb } from './testing/memoryUserDb.ts';

let bundle: AppBundle | undefined;
let catalogDb: SqliteDatabase | undefined;
let userDb: SqliteDatabase | undefined;

beforeAll(() => {
  catalogDb = new SqliteDatabase(':memory:');
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

describe('Armory app wiring', () => {
  it('GET /readyz probes both catalogDb and userDb and returns 503 if either fails', async () => {
    const ok = await request(bundle!.app).get('/readyz');
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ status: 'ready', app: APP_NAME });

    const brokenDb = {
      prepare: () => {
        throw new Error('db unavailable');
      },
    } as unknown as SqliteDatabase;

    const catalogDown = createApp({ catalogDb: brokenDb, userDb });
    const res1 = await request(catalogDown.app).get('/readyz');
    expect(res1.status).toBe(503);
    expect(res1.body).toEqual({ status: 'not_ready', app: APP_NAME });

    const userDown = createApp({ catalogDb, userDb: brokenDb });
    const res2 = await request(userDown.app).get('/readyz');
    expect(res2.status).toBe(503);
    expect(res2.body).toEqual({ status: 'not_ready', app: APP_NAME });
  });

  it('blocks *.hash files under /images and redirects legacy auth paths', async () => {
    const hashRes = await request(bundle!.app).get('/images/warframes.hash');
    expect(hashRes.status).toBe(404);

    for (const legacyPath of ['/login', '/profile', '/auth/profile']) {
      const res = await request(bundle!.app).get(legacyPath);
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('/sign-in');
    }

    const legal = await request(bundle!.app).get('/auth/legal');
    expect(legal.status).toBe(302);
    expect(legal.headers.location).toBe(LEGAL_PAGE_URL);
  });
});

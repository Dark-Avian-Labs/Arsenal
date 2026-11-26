import { SqliteDatabase } from '@dark-avian-labs/server-kit';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';
import { APP_NAME } from './config.ts';

let bundle: AppBundle | undefined;
let appDb: SqliteDatabase | undefined;

beforeAll(() => {
  appDb = new SqliteDatabase(':memory:');
  appDb.pragma('foreign_keys = ON');
  bundle = createApp({ appDb });
});

afterAll(() => {
  appDb?.close();
});

describe('budget-planner app wiring', () => {
  it('GET /readyz probes appDb (200 healthy, 503 closed) and /api/health returns ok', async () => {
    const ready = await request(bundle!.app).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', app: APP_NAME });

    const health = await request(bundle!.app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', app: APP_NAME });

    const downAppDb = new SqliteDatabase(':memory:');
    const down = createApp({ appDb: downAppDb });
    downAppDb.close();
    const downRes = await request(down.app).get('/readyz');
    expect(downRes.status).toBe(503);
    expect(downRes.body).toEqual({ status: 'not_ready', app: APP_NAME });
  });

  it('GET /api/me and /api/auth/me return 503 when Clerk is unconfigured', async () => {
    expect((await request(bundle!.app).get('/api/me')).status).toBe(503);
    expect((await request(bundle!.app).get('/api/auth/me')).status).toBe(503);
  });

  it('enforces 64kb JSON body limit', async () => {
    const oversized = { data: 'x'.repeat(80 * 1024) };
    const res = await request(bundle!.app).post('/api/nope').send(oversized);
    expect(res.status).toBe(413);
  });
});

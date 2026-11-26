import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';
import { closeMetricsDb } from './metrics/db.ts';

let bundle: AppBundle;

beforeAll(() => {
  bundle = createApp();
});

afterAll(() => {
  closeMetricsDb();
});

describe('sentinel app wiring', () => {
  it('exposes /readyz and /api/health and gates /api/auth/me, /api/fleet, and /api/actions', async () => {
    expect((await request(bundle.app).get('/readyz')).status).toBe(200);
    expect((await request(bundle.app).get('/api/health')).status).toBe(200);
    expect((await request(bundle.app).get('/api/auth/me')).status).toBe(401);
    expect((await request(bundle.app).get('/api/fleet')).status).toBe(401);
    expect((await request(bundle.app).get('/api/actions/runs')).status).toBe(401);
  });

  it('allows POST /api/ingest to bypass the cross-site guard for server-to-server agents', async () => {
    const res = await request(bundle.app)
      .post('/api/ingest')
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Authorization', 'Bearer test-ingest-token')
      .send({ samples: [{ kind: 'process', appId: 'codex', cpu: 2 }] });
    expect(res.status).toBe(204);
  });
});

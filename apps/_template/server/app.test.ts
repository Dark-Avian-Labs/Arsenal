import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import type { AppBundle } from './app.ts';
import { createApp } from './app.ts';

let bundle: AppBundle;

beforeAll(() => {
  bundle = createApp();
});

describe('template app wiring', () => {
  it('mounts /healthz, /readyz, /api/health, and gates /api/auth/me with 401', async () => {
    expect((await request(bundle.app).get('/healthz')).status).toBe(200);
    expect((await request(bundle.app).get('/readyz')).status).toBe(200);
    expect((await request(bundle.app).get('/api/health')).status).toBe(200);
    expect((await request(bundle.app).get('/api/auth/me')).status).toBe(401);
  });
});

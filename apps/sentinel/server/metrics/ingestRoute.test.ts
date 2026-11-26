import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.ts';
import { closeMetricsDb, getMetricsDb } from './db.ts';

describe('POST /api/ingest', () => {
  afterEach(() => {
    closeMetricsDb();
  });

  it('rejects missing or wrong token with 401 and invalid bodies with 400', async () => {
    const { app } = createApp();
    const missing = await request(app)
      .post('/api/ingest')
      .send({ samples: [{ kind: 'process', appId: 'codex', cpu: 1 }] });
    expect(missing.status).toBe(401);

    const wrong = await request(app)
      .post('/api/ingest')
      .set('Authorization', 'Bearer wrong-token')
      .send({ samples: [{ kind: 'process', appId: 'codex', cpu: 1 }] });
    expect(wrong.status).toBe(401);

    const invalid = await request(app)
      .post('/api/ingest')
      .set('Authorization', 'Bearer test-ingest-token')
      .send({ samples: [] });
    expect(invalid.status).toBe(400);
  });

  it('accepts Bearer and x-sentinel-token auth and persists samples into SQLite', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/ingest')
      .set('Authorization', 'Bearer test-ingest-token')
      .send({ samples: [{ kind: 'process', appId: 'codex', displayName: 'Codex', cpu: 8 }] })
      .expect(204);

    await request(app)
      .post('/api/ingest')
      .set('x-sentinel-token', 'test-ingest-token')
      .send({
        samples: [
          { kind: 'http', appId: 'codex', method: 'GET', routePattern: '/api/status', statusClass: '2xx', count: 3 },
        ],
      })
      .expect(204);

    const db = getMetricsDb();
    expect((db.prepare('SELECT COUNT(*) AS c FROM samples_raw WHERE app_id = ?').get('codex') as { c: number }).c).toBe(
      1,
    );
    expect((db.prepare('SELECT COUNT(*) AS c FROM http_raw WHERE app_id = ?').get('codex') as { c: number }).c).toBe(1);
  });
});

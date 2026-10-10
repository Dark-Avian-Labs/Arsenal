import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';
import { closeMetricsDb } from './db.js';

describe('POST /api/ingest', () => {
  afterEach(() => {
    closeMetricsDb();
  });

  it('rejects missing token', async () => {
    const { app, sessionStore } = createApp();
    try {
      const res = await request(app)
        .post('/api/ingest')
        .send({ samples: [{ kind: 'process', appId: 'codex', cpu: 1 }] });
      expect(res.status).toBe(401);
    } finally {
      sessionStore.dispose();
    }
  });

  it('accepts a valid process sample', async () => {
    const { app, sessionStore } = createApp();
    try {
      const res = await request(app)
        .post('/api/ingest')
        .set('Authorization', 'Bearer test-ingest-token')
        .send({ samples: [{ kind: 'process', appId: 'codex', displayName: 'Codex', cpu: 8 }] });
      expect(res.status).toBe(204);
    } finally {
      sessionStore.dispose();
    }
  });
});

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createArsenalHostApp, parseHostMapEnv } from './hostRouter.ts';

function stubApp(name: string) {
  const app = express();
  app.get('/ping', (_req, res) => res.json({ app: name }));
  return app;
}

describe('createArsenalHostApp', () => {
  const hostApp = createArsenalHostApp({
    appVersion: '2.0.0',
    trustProxy: true,
    hostMap: parseHostMapEnv('{"custom.example.com":"outfitter"}'),
    apps: {
      codex: stubApp('codex'),
      armory: stubApp('armory'),
      outfitter: stubApp('outfitter'),
      'budget-planner': stubApp('budget-planner'),
    },
    readinessChecks: {
      codex: () => true,
      armory: () => true,
      outfitter: () => true,
      'budget-planner': () => true,
    },
  });

  it('dispatches requests by Host subdomain and custom hostMap', async () => {
    const cases: Array<[string, string]> = [
      ['codex.darkavianlabs.com', 'codex'],
      ['armory.darkavianlabs.com', 'armory'],
      ['outfitter.darkavianlabs.com', 'outfitter'],
      ['budget.darkavianlabs.com', 'budget-planner'],
      ['custom.example.com', 'outfitter'],
    ];

    for (const [host, expected] of cases) {
      const res = await request(hostApp).get('/ping').set('Host', host);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ app: expected });
    }
  });

  it('ignores spoofed X-Forwarded-Host when trustProxy is false', async () => {
    const untrusted = createArsenalHostApp({
      appVersion: '2.0.0',
      trustProxy: false,
      allowHeaderOverride: false,
      apps: {
        codex: stubApp('codex'),
        armory: stubApp('armory'),
        outfitter: stubApp('outfitter'),
        'budget-planner': stubApp('budget-planner'),
      },
    });

    const res = await request(untrusted)
      .get('/ping')
      .set('Host', 'codex.darkavianlabs.com')
      .set('X-Forwarded-Host', 'armory.darkavianlabs.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ app: 'codex' });
  });

  it('honors X-Forwarded-Host when trustProxy is true', async () => {
    const res = await request(hostApp)
      .get('/ping')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'armory.darkavianlabs.com');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ app: 'armory' });
  });

  it('supports X-Arsenal-App header routing for local dev/testing', async () => {
    const res = await request(hostApp).get('/ping').set('Host', '127.0.0.1:3000').set('X-Arsenal-App', 'armory');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ app: 'armory' });
  });

  it('serves unified /healthz, /readyz, and /api/version endpoints', async () => {
    const health = await request(hostApp).get('/healthz');
    expect(health.status).toBe(200);
    expect(health.body.ok).toBe(true);

    const version = await request(hostApp).get('/api/version');
    expect(version.status).toBe(200);
    expect(version.body).toEqual({ version: '2.0.0' });

    const ready = await request(hostApp).get('/readyz');
    expect(ready.status).toBe(200);
    expect(ready.body.ok).toBe(true);
  });

  it('returns 503 on /readyz if any mounted sub-app fails readiness', async () => {
    const failing = createArsenalHostApp({
      appVersion: '2.0.0',
      trustProxy: false,
      apps: {
        codex: stubApp('codex'),
        armory: stubApp('armory'),
        outfitter: stubApp('outfitter'),
        'budget-planner': stubApp('budget-planner'),
      },
      readinessChecks: {
        codex: () => true,
        armory: () => false,
        outfitter: () => true,
        'budget-planner': () => true,
      },
    });
    const res = await request(failing).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.apps.armory).toBe(false);
  });
});

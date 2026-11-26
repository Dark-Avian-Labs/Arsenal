import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '@dark-avian-labs/server-kit';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const webhookVerifyMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/express/webhooks', () => ({
  verifyWebhook: webhookVerifyMock,
}));

import { createArsenalHostApp, MOUNTED_APP_LABELS, parseHostMapEnv, resolveMountedAppId } from './hostRouter.ts';

function stubApp(name: string) {
  const app = express();
  app.get('/ping', (_req, res) => res.json({ app: name }));
  return app;
}

describe('createArsenalHostApp', () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    vi.clearAllMocks();
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  const hostApp = createArsenalHostApp({
    appVersion: '2.0.0',
    trustProxy: true,
    hostMap: parseHostMapEnv('{"Custom.Example.Com:8443":"outfitter","bad.host":"unknown"}'),
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

  it('dispatches requests by Host subdomain, aliases, ports, uppercase, and hostMap, falling back to defaultApp', async () => {
    const cases: Array<[string, string]> = [
      ['codex.darkavianlabs.com', 'codex'],
      ['ARMORY.DarkAvianLabs.com:3006', 'armory'],
      ['outfitter.darkavianlabs.com', 'outfitter'],
      ['budget.darkavianlabs.com', 'budget-planner'],
      ['budgetplanner.darkavianlabs.com', 'budget-planner'],
      ['budget-planner.darkavianlabs.com', 'budget-planner'],
      ['custom.example.com', 'outfitter'],
      ['unknown.darkavianlabs.com', 'codex'],
      ['[::1]:3006', 'codex'],
      ['::1', 'codex'],
    ];

    for (const [host, expected] of cases) {
      const res = await request(hostApp).get('/ping').set('Host', host);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ app: expected });
    }
    expect(parseHostMapEnv('{invalid-json')).toEqual({});
  });

  it('ignores spoofed X-Forwarded-Host when trustProxy is false and ignores X-Arsenal-App when allowHeaderOverride is false', async () => {
    const prodLike = createArsenalHostApp({
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

    const spoofedProxy = await request(prodLike)
      .get('/ping')
      .set('Host', 'codex.darkavianlabs.com')
      .set('X-Forwarded-Host', 'armory.darkavianlabs.com');
    expect(spoofedProxy.status).toBe(200);
    expect(spoofedProxy.body).toEqual({ app: 'codex' });

    const spoofedHeader = await request(prodLike)
      .get('/ping')
      .set('Host', 'codex.darkavianlabs.com')
      .set('X-Arsenal-App', 'armory');
    expect(spoofedHeader.status).toBe(200);
    expect(spoofedHeader.body).toEqual({ app: 'codex' });
  });

  it('honors comma-separated X-Forwarded-Host when trustProxy is true and X-Arsenal-App when allowed', async () => {
    const proxied = await request(hostApp)
      .get('/ping')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'armory.darkavianlabs.com, proxy.internal');
    expect(proxied.status).toBe(200);
    expect(proxied.body).toEqual({ app: 'armory' });

    const override = await request(hostApp).get('/ping').set('Host', '127.0.0.1:3000').set('X-Arsenal-App', 'armory');
    expect(override.status).toBe(200);
    expect(override.body).toEqual({ app: 'armory' });
  });

  it('serves unified /healthz, /readyz, and /api/version, returning 503 when a readiness check returns false or throws', async () => {
    expect((await request(hostApp).get('/healthz')).body).toEqual({
      ok: true,
      service: 'arsenal',
      apps: ['codex', 'armory', 'outfitter', 'budget-planner'],
    });
    const version = await request(hostApp).get('/api/version');
    expect(version.status).toBe(200);
    expect(version.headers['cache-control']).toBe('no-store');
    expect(version.body).toEqual({ version: '2.0.0' });
    expect((await request(hostApp).get('/readyz')).status).toBe(200);

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
        codex: async () => {
          throw new Error('sqlite locked');
        },
        armory: () => false,
        outfitter: () => true,
        'budget-planner': () => true,
      },
    });
    const res = await request(failing).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      ok: false,
      apps: { codex: false, armory: false, outfitter: true, 'budget-planner': true },
    });
  });

  it('intercepts /api/webhooks/clerk with raw body before sub-app dispatch and attributes metrics per resolved app', async () => {
    const onUserDeleted = vi.fn();
    const seenLabels: string[] = [];
    webhookVerifyMock.mockResolvedValueOnce({
      type: 'user.deleted',
      data: { id: 'user_99' },
    });

    const appWithHooks = createArsenalHostApp({
      appVersion: '2.0.0',
      trustProxy: false,
      metricsMiddleware: (req, _res, next) => {
        const id = resolveMountedAppId(req, {
          hostMap: {},
          defaultApp: 'codex',
          allowHeaderOverride: false,
        });
        seenLabels.push(MOUNTED_APP_LABELS[id].appId);
        next();
      },
      webhookHandlers: {
        signingSecret: () => 'whsec_test',
        onUserDeleted,
      },
      apps: {
        codex: stubApp('codex'),
        armory: stubApp('armory'),
        outfitter: stubApp('outfitter'),
        'budget-planner': stubApp('budget-planner'),
      },
    });

    const hookRes = await request(appWithHooks)
      .post('/api/webhooks/clerk')
      .set('Host', 'armory.darkavianlabs.com')
      .set('Content-Type', 'application/json')
      .send('{"type":"user.deleted"}');
    expect(hookRes.status).toBe(200);
    expect(onUserDeleted).toHaveBeenCalledWith('user_99');

    await request(appWithHooks).get('/ping').set('Host', 'budget.darkavianlabs.com');
    expect(seenLabels).toEqual(['armory', 'budgetplanner']);
  });

  it('isolates CSP headers and API routes across mounted real server-kit apps', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arsenal-real-mount-'));
    const outfitterBundle = createApp({
      appName: 'Outfitter',
      appId: 'outfitter',
      appVersion: '1.0.0',
      projectRoot: tmpDir,
      nodeEnv: 'test',
      trustProxy: false,
      secureCookies: false,
      legalPageUrl: 'https://example.com/legal',
      helmet: { extraScriptSrc: ["'wasm-unsafe-eval'"] },
    });
    outfitterBundle.apiRouter.get('/outfitter-only', (_req, res) => res.json({ app: 'outfitter' }));

    const budgetBundle = createApp({
      appName: 'BudgetPlanner',
      appId: 'budgetplanner',
      appVersion: '1.0.0',
      projectRoot: tmpDir,
      nodeEnv: 'test',
      trustProxy: false,
      secureCookies: false,
      legalPageUrl: 'https://example.com/legal',
    });
    budgetBundle.apiRouter.get('/budget-only', (_req, res) => res.json({ app: 'budget' }));

    const unified = createArsenalHostApp({
      appVersion: '2.0.0',
      trustProxy: false,
      apps: {
        codex: stubApp('codex'),
        armory: stubApp('armory'),
        outfitter: outfitterBundle.app,
        'budget-planner': budgetBundle.app,
      },
    });

    const outfitterRes = await request(unified).get('/api/outfitter-only').set('Host', 'outfitter.darkavianlabs.com');
    expect(outfitterRes.status).toBe(200);
    expect(outfitterRes.headers['content-security-policy']).toContain("'wasm-unsafe-eval'");

    const budgetHitOutfitterRoute = await request(unified)
      .get('/api/outfitter-only')
      .set('Host', 'budget.darkavianlabs.com');
    expect(budgetHitOutfitterRoute.status).toBe(404);
    expect(budgetHitOutfitterRoute.headers['content-security-policy']).not.toContain("'wasm-unsafe-eval'");
  });
});

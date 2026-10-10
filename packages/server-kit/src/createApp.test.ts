import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createApp } from './createApp.ts';
import { withServer } from './testing/index.ts';

describe('favicon', () => {
  const previousPublishable = process.env.CLERK_PUBLISHABLE_KEY;
  const previousSecret = process.env.CLERK_SECRET_KEY;
  let root = '';

  afterEach(() => {
    if (previousPublishable === undefined) delete process.env.CLERK_PUBLISHABLE_KEY;
    else process.env.CLERK_PUBLISHABLE_KEY = previousPublishable;
    if (previousSecret === undefined) delete process.env.CLERK_SECRET_KEY;
    else process.env.CLERK_SECRET_KEY = previousSecret;
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = '';
  });

  function app() {
    delete process.env.CLERK_PUBLISHABLE_KEY;
    delete process.env.CLERK_SECRET_KEY;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'favicon-'));
    return createApp({
      appName: 'test',
      appId: 'test',
      appVersion: '0.0.0',
      projectRoot: root,
      nodeEnv: 'test',
      trustProxy: false,
      secureCookies: false,
      legalPageUrl: 'https://example.com/legal',
    }).app;
  }

  it('serves the favicon Vite writes into dist/client', async () => {
    const server = app();
    const file = path.join(root, 'dist', 'client', 'favicon.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from([137, 80, 78, 71]));

    await withServer(server, async (baseUrl) => {
      const png = await fetch(`${baseUrl}/favicon.png`);
      expect(png.status).toBe(200);
      expect(new Uint8Array(await png.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));

      const ico = await fetch(`${baseUrl}/favicon.ico`);
      expect(ico.status).toBe(200);
    });
  });

  it('returns 404 when the built favicon is missing', async () => {
    const server = app();
    await withServer(server, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/favicon.png`);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('');
    });
  });
});

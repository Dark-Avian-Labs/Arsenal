import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { withServer } from '../testing/index.ts';
import { createAppHelmet, getClerkFapiOrigin } from './helmetCsp.ts';

describe('helmetCsp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves CLERK_FAPI_URL, VITE_CLERK_FAPI_URL, and production default', () => {
    vi.stubEnv('CLERK_FAPI_URL', '');
    vi.stubEnv('VITE_CLERK_FAPI_URL', '');
    expect(getClerkFapiOrigin()).toBe('https://clerk.darkavianlabs.com');

    vi.stubEnv('VITE_CLERK_FAPI_URL', 'https://vite.example.test/');
    expect(getClerkFapiOrigin()).toBe('https://vite.example.test');

    vi.stubEnv('CLERK_FAPI_URL', 'https://clerk.example.test/');
    expect(getClerkFapiOrigin()).toBe('https://clerk.example.test');
  });

  it('merges extraScriptSrc/extraConnectSrc and honors hsts flag in createAppHelmet', async () => {
    const app = express();
    app.use(
      createAppHelmet({
        hsts: false,
        extraScriptSrc: ["'wasm-unsafe-eval'"],
        extraConnectSrc: ['https://api.example.test'],
      }),
    );
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    await withServer(app, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/ping`);
      const csp = res.headers.get('content-security-policy') ?? '';
      expect(csp).toContain("'wasm-unsafe-eval'");
      expect(csp).toContain('https://api.example.test');
      expect(res.headers.get('strict-transport-security')).toBeNull();
    });
  });
});

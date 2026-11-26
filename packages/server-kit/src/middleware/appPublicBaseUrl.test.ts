import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAppPublicBaseUrl } from './appPublicBaseUrl.ts';

const KEYS = [
  'APP_PUBLIC_BASE_URL',
  'ARSENAL_UNIFIED_HOST',
  'BASE_DOMAIN',
  'BASE_PROTOCOL',
  'APP_SUBDOMAIN',
  'APP_ID',
  'NODE_ENV',
] as const;

describe('getAppPublicBaseUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stub(env: Partial<Record<(typeof KEYS)[number], string>>): void {
    for (const key of KEYS) vi.stubEnv(key, env[key] ?? '');
  }

  it('prefers explicit APP_PUBLIC_BASE_URL outside the unified host and strips trailing slash', () => {
    stub({
      NODE_ENV: 'production',
      APP_PUBLIC_BASE_URL: 'https://armory.darkavianlabs.com/',
      BASE_DOMAIN: 'darkavianlabs.com',
    });
    expect(getAppPublicBaseUrl({ unifiedHostSubdomain: 'codex' })).toBe('https://armory.darkavianlabs.com');
  });

  it("uses the caller's subdomain inside the unified host instead of the shared Codex URL", () => {
    stub({
      NODE_ENV: 'production',
      ARSENAL_UNIFIED_HOST: '1',
      APP_PUBLIC_BASE_URL: 'https://codex.darkavianlabs.com',
      BASE_DOMAIN: 'darkavianlabs.com',
      BASE_PROTOCOL: 'https',
    });
    expect(getAppPublicBaseUrl({ unifiedHostSubdomain: 'armory' })).toBe('https://armory.darkavianlabs.com');
    expect(getAppPublicBaseUrl()).toBe('https://codex.darkavianlabs.com');
  });

  it('falls back to APP_PUBLIC_BASE_URL in the unified host when BASE_DOMAIN is missing', () => {
    stub({
      NODE_ENV: 'production',
      ARSENAL_UNIFIED_HOST: '1',
      APP_PUBLIC_BASE_URL: 'https://codex.darkavianlabs.com',
    });
    expect(getAppPublicBaseUrl({ unifiedHostSubdomain: 'armory' })).toBe('https://codex.darkavianlabs.com');
  });

  it('builds URL from BASE_DOMAIN using APP_SUBDOMAIN, APP_ID, or codex default', () => {
    stub({ NODE_ENV: 'production', BASE_DOMAIN: 'example.com', APP_SUBDOMAIN: 'armory' });
    expect(getAppPublicBaseUrl()).toBe('https://armory.example.com');

    stub({ NODE_ENV: 'production', BASE_DOMAIN: 'example.com', APP_ID: 'myapp' });
    expect(getAppPublicBaseUrl()).toBe('https://myapp.example.com');

    stub({ NODE_ENV: 'production', BASE_DOMAIN: 'example.com' });
    expect(getAppPublicBaseUrl()).toBe('https://codex.example.com');
  });

  it('enforces HTTPS in production (except localhost) and rejects invalid URLs or protocols', () => {
    stub({ NODE_ENV: 'production', APP_PUBLIC_BASE_URL: 'http://codex.example.com/' });
    expect(() => getAppPublicBaseUrl()).toThrow();

    stub({ NODE_ENV: 'production', APP_PUBLIC_BASE_URL: 'http://127.0.0.1:3000/' });
    expect(getAppPublicBaseUrl()).toBe('http://127.0.0.1:3000');

    stub({ NODE_ENV: 'development', APP_PUBLIC_BASE_URL: 'http://codex.example.com/' });
    expect(getAppPublicBaseUrl()).toBe('http://codex.example.com');

    stub({ NODE_ENV: 'development', APP_PUBLIC_BASE_URL: 'not-a-valid-url' });
    expect(() => getAppPublicBaseUrl()).toThrow('APP_PUBLIC_BASE_URL must be a valid URL.');

    stub({ NODE_ENV: 'development', BASE_DOMAIN: 'example.com', BASE_PROTOCOL: 'ftp' });
    expect(() => getAppPublicBaseUrl()).toThrow(/APP_PUBLIC_BASE_URL|BASE_DOMAIN/);

    stub({ NODE_ENV: 'development' });
    expect(() => getAppPublicBaseUrl()).toThrow(/APP_PUBLIC_BASE_URL|BASE_DOMAIN/);
  });
});

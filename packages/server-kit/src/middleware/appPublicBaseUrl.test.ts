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

  it('returns APP_PUBLIC_BASE_URL outside the unified host, ignoring the subdomain hint', () => {
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
});

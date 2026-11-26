import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClerkAuthorizedParties } from './clerkAuthorizedParties.ts';

describe('getClerkAuthorizedParties', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('includes app public URL and configured sibling origins in production, dropping http siblings', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_PUBLIC_BASE_URL', 'https://appbase.example.com/');
    vi.stubEnv(
      'ALLOWED_APP_ORIGINS',
      'https://codex.example.com,http://insecure.example.com,https://armory.example.com',
    );

    expect(getClerkAuthorizedParties()).toEqual([
      'https://appbase.example.com',
      'https://codex.example.com',
      'https://armory.example.com',
    ]);
  });

  it('rejects non-https APP_PUBLIC_BASE_URL and missing APP_PUBLIC_BASE_URL in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOWED_APP_ORIGINS', '');

    vi.stubEnv('APP_PUBLIC_BASE_URL', 'http://appbase.example.com');
    expect(() => getClerkAuthorizedParties()).toThrow();

    vi.stubEnv('APP_PUBLIC_BASE_URL', '');
    expect(() => getClerkAuthorizedParties()).toThrow();
  });

  it('includes localhost origins in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('APP_PUBLIC_BASE_URL', 'http://localhost:3000');
    vi.stubEnv('ALLOWED_APP_ORIGINS', '');

    const parties = getClerkAuthorizedParties();
    expect(parties).toContain('http://localhost:3000');
    expect(parties).toContain('http://localhost:5173');
  });
});

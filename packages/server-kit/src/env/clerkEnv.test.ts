import { afterEach, describe, expect, it, vi } from 'vitest';

import { isEncryptedEnvValue, normalizeClerkEnv } from './clerkEnv.ts';

describe('clerkEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('maps VITE_CLERK_PUBLISHABLE_KEY to CLERK_PUBLISHABLE_KEY for Clerk Express', () => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', 'pk_live_example');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_live_example');
    vi.stubEnv('NODE_ENV', 'production');

    normalizeClerkEnv();

    expect(process.env.CLERK_PUBLISHABLE_KEY).toBe('pk_live_example');
  });

  it('throws when Clerk values are still encrypted', () => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', 'encrypted:abc');
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_live_example');
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => normalizeClerkEnv()).toThrow(/still encrypted/i);
  });

  it('throws in production when required keys are missing, unless requireKeys is false', () => {
    vi.stubEnv('CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_CLERK_PUBLISHABLE_KEY', '');
    vi.stubEnv('CLERK_SECRET_KEY', '');
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => normalizeClerkEnv()).toThrow(/Clerk/i);
    expect(() => normalizeClerkEnv({ requireKeys: false })).not.toThrow();
  });

  it('detects encrypted dotenvx values', () => {
    expect(isEncryptedEnvValue('encrypted:abc')).toBe(true);
    expect(isEncryptedEnvValue('pk_live_example')).toBe(false);
    expect(isEncryptedEnvValue(undefined)).toBe(false);
  });
});

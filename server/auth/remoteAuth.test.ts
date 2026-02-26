import { describe, expect, it } from 'vitest';

import { buildAuthLoginUrl } from './remoteAuth.js';

describe('buildAuthLoginUrl', () => {
  it('builds next URL from canonical public base when configured', () => {
    const original = process.env.APP_PUBLIC_BASE_URL;
    process.env.APP_PUBLIC_BASE_URL = 'https://appbase.example.com';
    try {
      const req = {
        originalUrl: '/',
        protocol: 'http',
        headers: {
          'x-forwarded-host': 'attacker.example.com',
          'x-forwarded-proto': 'http',
        },
        get(name: string) {
          if (name === 'host') return 'attacker.example.com';
          return '';
        },
      } as unknown as Parameters<typeof buildAuthLoginUrl>[0];

      const loginUrl = buildAuthLoginUrl(req);
      const parsed = new URL(loginUrl);
      expect(parsed.pathname).toBe('/login');
      expect(parsed.searchParams.get('next')).toBe('https://appbase.example.com/');
    } finally {
      process.env.APP_PUBLIC_BASE_URL = original;
    }
  });
});

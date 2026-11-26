import { describe, expect, it } from 'vitest';

import { buildAuthPagePath, getAuthRedirectUrl, safeAuthRedirectPath } from './authRedirect';

describe('authRedirect', () => {
  it('keeps same-origin paths and rejects cross-origin or control-char redirects', () => {
    expect(safeAuthRedirectPath('/builds/42?tab=mods#top')).toBe('/builds/42?tab=mods#top');
    expect(safeAuthRedirectPath('/%09/evil.com')).toBe('/%09/evil.com');

    for (const path of [
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      decodeURIComponent('/%09/evil.com'),
      '/\n/evil.com',
      'https://evil.com',
      'evil.com',
    ]) {
      expect(safeAuthRedirectPath(path)).toBeNull();
    }
  });

  it('builds safe auth page paths and falls back on unsafe query redirects', () => {
    expect(buildAuthPagePath('/sign-in', '/plans/1?tab=entries')).toBe(
      '/sign-in?redirect_url=%2Fplans%2F1%3Ftab%3Dentries',
    );
    expect(buildAuthPagePath('/sign-in', 'https://evil.com')).toBe('/sign-in');

    expect(getAuthRedirectUrl(new URLSearchParams('redirect_url=%2Fbuilds'), '/')).toBe('/builds');
    expect(getAuthRedirectUrl(new URLSearchParams('redirect_url=https%3A%2F%2Fevil.com'), '/home')).toBe('/home');
  });
});

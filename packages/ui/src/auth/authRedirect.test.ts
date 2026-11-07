import { describe, expect, it } from 'vitest';

import { safeAuthRedirectPath } from './authRedirect';

describe('safeAuthRedirectPath', () => {
  it('keeps same-origin paths', () => {
    expect(safeAuthRedirectPath('/builds/42?tab=mods#top')).toBe('/builds/42?tab=mods#top');
    expect(safeAuthRedirectPath('/%09/evil.com')).toBe('/%09/evil.com');
  });

  it('rejects anything that resolves to another origin', () => {
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
});

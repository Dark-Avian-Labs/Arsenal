import { describe, expect, it } from 'vitest';

import { isAppAdmin, metadataFromSessionClaims } from './clerk.js';

describe('metadataFromSessionClaims', () => {
  it('reads apps from the metadata claim', () => {
    const metadata = metadataFromSessionClaims({
      metadata: { apps: { outfitter: 'admin', codex: 'user' } },
    });
    expect(metadata?.apps).toEqual({ outfitter: 'admin', codex: 'user' });
  });

  it('falls back to public_metadata and matches the app id ignoring case', () => {
    const metadata = metadataFromSessionClaims({
      public_metadata: { apps: { Outfitter: 'admin' } },
    });
    expect(isAppAdmin(metadata, 'outfitter')).toBe(true);
  });

  it('returns undefined when the apps map has no string roles', () => {
    expect(metadataFromSessionClaims({ metadata: { apps: { codex: 1 } } })).toBeUndefined();
  });
});

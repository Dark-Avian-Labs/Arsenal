import { describe, expect, it } from 'vitest';

import { isUnreleasedArcane, resolveArcaneImportRarity, UNRELEASED_ARCANE_UNIQUE_NAMES } from './arcaneCatalog.ts';

describe('arcaneCatalog', () => {
  it('defaults blank rarity to COMMON and preserves explicit export rarity', () => {
    expect(resolveArcaneImportRarity(undefined)).toBe('COMMON');
    expect(resolveArcaneImportRarity(null)).toBe('COMMON');
    expect(resolveArcaneImportRarity('  ')).toBe('COMMON');
    expect(resolveArcaneImportRarity('LEGENDARY')).toBe('LEGENDARY');
  });

  it('flags configured unreleased arcanes while allowing released ones', () => {
    for (const uniqueName of UNRELEASED_ARCANE_UNIQUE_NAMES) {
      expect(isUnreleasedArcane(uniqueName)).toBe(true);
    }
    expect(isUnreleasedArcane('/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneEnergize')).toBe(false);
  });
});

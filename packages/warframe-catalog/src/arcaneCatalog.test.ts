import { describe, expect, it } from 'vitest';

import {
  ARCANE_PUBLIC_LIST_SQL,
  isUnreleasedArcane,
  resolveArcaneImportRarity,
  UNRELEASED_ARCANE_UNIQUE_NAMES,
} from './arcaneCatalog.ts';

describe('arcaneCatalog', () => {
  it('defaults missing rarity to COMMON', () => {
    expect(resolveArcaneImportRarity(undefined)).toBe('COMMON');
    expect(resolveArcaneImportRarity(null)).toBe('COMMON');
    expect(resolveArcaneImportRarity('')).toBe('COMMON');
    expect(resolveArcaneImportRarity('  ')).toBe('COMMON');
  });

  it('preserves export rarity when present', () => {
    expect(resolveArcaneImportRarity('LEGENDARY')).toBe('LEGENDARY');
    expect(resolveArcaneImportRarity('Rare')).toBe('Rare');
  });

  it('hides arcanes the export marks excludeFromCodex', () => {
    expect(ARCANE_PUBLIC_LIST_SQL).toContain('COALESCE(exclude_from_codex, 0) = 0');
  });

  it('flags Arcane Survival as unreleased', () => {
    expect(UNRELEASED_ARCANE_UNIQUE_NAMES).toHaveLength(1);
    expect(isUnreleasedArcane(UNRELEASED_ARCANE_UNIQUE_NAMES[0]!)).toBe(true);
    expect(isUnreleasedArcane('/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneEnergize')).toBe(false);
  });
});

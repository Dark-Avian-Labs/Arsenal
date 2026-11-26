import { describe, expect, it } from 'vitest';

import {
  ARCHON_BUFF_SLUGS_BY_COLOR,
  ARCHON_COLORS,
  allArchonBuffCatalogKeys,
  applyArchonSlugToBonuses,
  archonSlugForSortOrder,
  archonSortOrderForSlug,
  buildArchonShardKey,
  parseArchonShardKey,
} from './archonShardRegistry.ts';

describe('archonShardRegistry', () => {
  it('maps sort_order to slug and back across all 27 buffs and generates 54 unique keys', () => {
    const counts = ARCHON_COLORS.map((c) => ARCHON_BUFF_SLUGS_BY_COLOR[c].length);
    expect(counts).toEqual([5, 5, 5, 4, 4, 4]);
    expect(archonSlugForSortOrder('Crimson', 1)).toBe('MeleeCritDamage');
    expect(archonSortOrderForSlug('Crimson', 'MeleeCritDamage')).toBe(1);
    expect(archonSlugForSortOrder('Emerald', 4)).toBe('MaxCorrosionStacks');
    expect(archonSlugForSortOrder('Crimson', 0)).toBeUndefined();
    expect(archonSlugForSortOrder('Crimson', 99)).toBeUndefined();

    const keys = allArchonBuffCatalogKeys();
    expect(keys).toHaveLength(54);
    expect(new Set(keys).size).toBe(54);
  });

  it('builds and parses archon keys and rejects unknown colors or slugs', () => {
    const key = buildArchonShardKey('Azure', 'Tauforged', 'Armor');
    expect(key).toBe('/Armory/Archon/Azure/Tauforged/Armor');
    expect(parseArchonShardKey(key)).toEqual({
      color: 'Azure',
      variant: 'Tauforged',
      buffSlug: 'Armor',
    });
    expect(parseArchonShardKey('/Armory/Archon/Fake/Common/Armor')).toBeNull();
    expect(parseArchonShardKey('/Armory/Archon/Azure/Common/NotASlug')).toBeNull();
  });

  it('accumulates percent and flat shard bonuses in applyArchonSlugToBonuses', () => {
    const bonuses: Parameters<typeof applyArchonSlugToBonuses>[3] = {};
    applyArchonSlugToBonuses('AbilityStrength', 15, '%', bonuses);
    applyArchonSlugToBonuses('AbilityStrength', 10, '%', bonuses);
    applyArchonSlugToBonuses('MaximumEnergy', 75, 'flat', bonuses);
    applyArchonSlugToBonuses('MaxEnergy', 25, 'flat', bonuses);
    applyArchonSlugToBonuses('CastingSpeed', 25, '%', bonuses);
    applyArchonSlugToBonuses('ParkourVelocity', 15, '%', bonuses);
    applyArchonSlugToBonuses('HealthRegen', 5, 'flat', bonuses);
    applyArchonSlugToBonuses('Armor', 150, 'flat', bonuses);

    expect(bonuses).toEqual({
      abilityStrengthPct: 0.25,
      energyPct: 0,
      energyFlat: 100,
      abilityEfficiencyPct: 0.25,
      sprintSpeedPct: 0.15,
      sprintSpeedFlat: 0,
      healthFlat: 5,
      armorPct: 0,
      armorFlat: 150,
    });
  });
});

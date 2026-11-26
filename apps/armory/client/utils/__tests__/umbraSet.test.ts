import { describe, it, expect } from 'vitest';

import type { Mod } from '../../types/warframe';
import {
  getUmbraTierStatBlockAtMaxRank,
  parseSetStatsTiers,
  resolveModRankDescriptionText,
  stripUmbraSetMarketingLines,
} from '../umbraSet';

describe('stripUmbraSetMarketingLines', () => {
  it('removes the marketing prefix from lines', () => {
    expect(stripUmbraSetMarketingLines('Enhance mods in this set.\n+110% Armor')).toBe('+110% Armor');
  });

  it('returns empty when only marketing text', () => {
    expect(stripUmbraSetMarketingLines('Enhance mods in this set.')).toBe('');
  });
});

describe('getUmbraTierStatBlockAtMaxRank', () => {
  const base: Mod = {
    unique_name: '/u',
    name: 'Umbral Fiber',
    mod_set: 'UmbraModSet',
    fusion_limit: 10,
  };

  it('returns null when tier is only set marketing copy (no parseable stats)', () => {
    const mod: Mod = {
      ...base,
      set_stats: JSON.stringify([
        'Enhance mods in this set.',
        'Enhance mods in this set.',
        'Enhance mods in this set.',
      ]),
    };
    expect(getUmbraTierStatBlockAtMaxRank(mod, 10, 3)).toBeNull();
  });

  it('returns stripped stats when tier has real numbers', () => {
    const mod: Mod = {
      ...base,
      set_stats: JSON.stringify(['Enhance mods in this set.\n+100% Health', '+130% Health', '+180% Health']),
    };
    expect(getUmbraTierStatBlockAtMaxRank(mod, 10, 3)).toBe('+180% Health');
  });
});

describe('malformed DB/import data boundaries', () => {
  it('parseSetStatsTiers returns null on invalid/non-array JSON and filters non-string entries', () => {
    expect(parseSetStatsTiers('{')).toBeNull();
    expect(parseSetStatsTiers(JSON.stringify('oops'))).toBeNull();
    expect(parseSetStatsTiers(JSON.stringify(['+100 Health', 42, null, '+200 Health']))).toEqual([
      '+100 Health',
      '+200 Health',
    ]);
  });

  it('resolveModRankDescriptionText handles empty JSON array and raw legacy text', () => {
    expect(
      resolveModRankDescriptionText(
        { unique_name: '/x', name: 'X', description: JSON.stringify([]), fusion_limit: 5 },
        0,
      ),
    ).toBe('');
    expect(
      resolveModRankDescriptionText({ unique_name: '/x', name: 'X', description: '+55% Damage', fusion_limit: 5 }, 0),
    ).toContain('+55%');
  });
});

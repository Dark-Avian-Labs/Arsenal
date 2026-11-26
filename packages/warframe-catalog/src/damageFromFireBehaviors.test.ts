import { describe, expect, it } from 'vitest';

import { damagePerShotFromAttackData, damagePerShotFromFireBehaviors } from './damageFromFireBehaviors.ts';
import { damagePerShotFromWikiEntries, parseWikiDamageCellText } from './damageFromWiki.ts';

describe('damageFromFireBehaviors', () => {
  it('parses Panzer Claws slash + toxin breakdown (new format)', () => {
    const damage = damagePerShotFromAttackData({
      Amount: 90,
      DT_SLASH: 45,
      DT_POISON: 45,
      UseNewFormat: 1,
      Type: 'DT_SLASH',
    });

    expect(damage?.[2]).toBe(45);
    expect(damage?.[6]).toBe(45);
  });

  it('parses legacy physical fractions and Type-only fallbacks', () => {
    const physical = damagePerShotFromAttackData({
      Amount: 90,
      DT_PUNCTURE: 0.5,
      DT_SLASH: 0.5,
      UseNewFormat: 0,
      Type: 'DT_PHYSICAL',
    });
    expect(physical?.[1]).toBe(45);
    expect(physical?.[2]).toBe(45);

    const fallbackType = damagePerShotFromAttackData({
      Amount: 50,
      UseNewFormat: 1,
      Type: 'DT_FIRE',
    });
    expect(fallbackType?.[3]).toBe(50);

    expect(damagePerShotFromAttackData({ Amount: 0, UseNewFormat: 1, Type: 'DT_SLASH' })).toBeNull();
  });

  it('parses combined secondary damage from fire_behaviors JSON and rejects malformed JSON', () => {
    const fireBehaviors = JSON.stringify([
      {
        'impact:WeaponImpactBehavior': {
          AttackData: {
            Amount: 80,
            DT_IMPACT: 40,
            DT_MAGNETIC: 40,
            UseNewFormat: 1,
            Type: 'DT_SLASH',
          },
        },
      },
    ]);

    const damage = damagePerShotFromFireBehaviors(fireBehaviors);
    expect(damage?.[0]).toBe(40);
    expect(damage?.[10]).toBe(40);
    expect(damagePerShotFromFireBehaviors('{not-json')).toBeNull();
  });
});

describe('damageFromWiki', () => {
  it('parses multiple damage types, sums duplicates, and ignores unmatched text', () => {
    const entries = parseWikiDamageCellText('Slash 45 Toxin 45 Slash 10');
    expect(entries).toEqual([
      { type: 'Slash', value: 45 },
      { type: 'Toxin', value: 45 },
      { type: 'Slash', value: 10 },
    ]);

    const damage = damagePerShotFromWikiEntries(entries);
    expect(damage?.[2]).toBe(55);
    expect(damage?.[6]).toBe(45);
    expect(parseWikiDamageCellText('No damage here')).toEqual([]);
    expect(damagePerShotFromWikiEntries([])).toBeNull();
  });
});

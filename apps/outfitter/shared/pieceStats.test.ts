import { describe, expect, it } from 'vitest';

import { artifactStatBag, loadoutStatBag, pieceStatBag, type GearPieceInput } from './pieceStats.ts';

function piece(
  slot: GearPieceInput['slot'],
  setKey = 'calamity',
  overrides: Partial<GearPieceInput> = {},
): GearPieceInput {
  return {
    id: 1,
    slot,
    setKey,
    mainStat: slot === 'armor' ? 'hp' : 'atk',
    mainValue: slot === 'armor' ? 1000 : 200,
    mainBonus: 0,
    substats: [],
    equippedHeroSlug: null,
    ...overrides,
  };
}

describe('pieceStatBag, artifactStatBag, and loadoutStatBag', () => {
  it('folds piece main stat, main bonus, and substats in pieceStatBag', () => {
    const bag = pieceStatBag(
      piece('weapon', 'calamity', {
        mainStat: 'atk',
        mainValue: 1000,
        mainBonus: 150,
        substats: [
          { stat: 'critRate', value: 22.5 },
          { stat: 'atkBonus', value: 18 },
        ],
      }),
    );
    expect(bag.flatAtk).toBe(1150);
    expect(bag.critRate).toBe(22.5);
    expect(bag.atkPct).toBe(18);
  });

  it('adds artifact flat HP/ATK and secondary stat', () => {
    const bag = artifactStatBag({
      hp_base: 4300,
      hp_bonus: 1840,
      atk_base: 1407,
      atk_bonus: 230,
      secondary_stat: 'atkBonus',
      secondary_value: 12,
    });
    expect(bag.flatHp).toBe(6140);
    expect(bag.flatAtk).toBe(1637);
    expect(bag.atkPct).toBe(12);
  });

  it('applies 2-piece left set and 3-piece right set bonuses plus artifact into loadoutStatBag', () => {
    const bag = loadoutStatBag(
      [
        piece('weapon', 'calamity'),
        piece('armor', 'calamity'),
        piece('bangle', 'the_insight', { mainStat: 'atkBonus', mainValue: 60 }),
        piece('amulet', 'the_insight', { mainStat: 'atkBonus', mainValue: 60 }),
        piece('ring', 'the_insight', { mainStat: 'atkBonus', mainValue: 60 }),
      ],
      {
        hp_base: 100,
        hp_bonus: 50,
        atk_base: 20,
        atk_bonus: 10,
        secondary_stat: 'atkSpd',
        secondary_value: 49,
      },
    );
    expect(bag.flatHp).toBe(1150);
    expect(bag.flatAtk).toBe(230);
    expect(bag.atkSpd).toBe(49);
    // Calamity (2pc left) adds +15% ATK on top of 3x60% bangle/amulet/ring main stats.
    expect(bag.atkPct).toBeGreaterThan(180);
    // The Insight (3pc right) adds +15% Crit Rate.
    expect(bag.critRate).toBe(15);
  });
});

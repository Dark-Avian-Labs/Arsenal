import { describe, expect, it } from 'vitest';

import {
  getRank30Bonuses,
  scaleAvatarStatsToMaxRank,
  scaleWarframeStatsToMaxRank,
  standardWarframeRankBonusesAtRank,
  DEFAULT_WARFRAME_RANK_30_BONUSES,
  WARFRAME_MAX_RANK,
} from './equipmentRankStats.ts';
import { WARFRAME_RANK_EXCEPTION_ENTRIES } from './warframeRankExceptions.generated.ts';

describe('equipmentRankStats', () => {
  it('computes standard warframe rank bonuses and clamps out-of-range ranks', () => {
    expect(standardWarframeRankBonusesAtRank(WARFRAME_MAX_RANK)).toEqual({
      health: 100,
      shield: 100,
      energy: 50,
      armor: 0,
    });
    expect(DEFAULT_WARFRAME_RANK_30_BONUSES).toEqual(standardWarframeRankBonusesAtRank(30));
    expect(standardWarframeRankBonusesAtRank(0)).toEqual({
      health: 0,
      shield: 0,
      energy: 0,
      armor: 0,
    });
    expect(standardWarframeRankBonusesAtRank(-5)).toEqual(standardWarframeRankBonusesAtRank(0));
    expect(standardWarframeRankBonusesAtRank(40)).toEqual(standardWarframeRankBonusesAtRank(30));
    expect(standardWarframeRankBonusesAtRank(3)).toEqual({
      health: 10,
      shield: 10,
      energy: 5,
      armor: 0,
    });
  });

  it('keeps unique DE paths in the warframe rank exceptions registry', () => {
    expect(WARFRAME_RANK_EXCEPTION_ENTRIES.length).toBeGreaterThan(0);
    const names = new Set(WARFRAME_RANK_EXCEPTION_ENTRIES.map((e) => e.uniqueName));
    expect(names.size).toBe(WARFRAME_RANK_EXCEPTION_ENTRIES.length);
  });

  it('applies standard, Inaros Prime, and Nidus exceptions and preserves zero shields', () => {
    expect(getRank30Bonuses('/Lotus/Powersuits/Excalibur/Excalibur')).toEqual({
      health: 100,
      shield: 100,
      energy: 50,
      armor: 0,
    });
    expect(getRank30Bonuses('/Lotus/Powersuits/Infestation/Infestation')).toEqual({
      health: 100,
      shield: 0,
      energy: 50,
      armor: 100,
    });

    const inaros = scaleWarframeStatsToMaxRank({
      unique_name: '/Lotus/Powersuits/Sandman/InarosPrime',
      health: 2215,
      shield: 0,
      armor: 240,
      power: 140,
    });
    expect(inaros).toMatchObject({ health: 2415, power: 190, shield: 0, armor: 240 });

    const zeroShield = scaleWarframeStatsToMaxRank({
      unique_name: '/Lotus/Powersuits/Excalibur/Excalibur',
      health: 270,
      shield: 0,
      armor: 240,
      power: 100,
    });
    expect(zeroShield.shield).toBe(0);

    const shielded = scaleWarframeStatsToMaxRank({
      unique_name: '/Lotus/Powersuits/Excalibur/Excalibur',
      health: 270,
      shield: 270,
      armor: 240,
      power: 100,
    });
    expect(shielded).toMatchObject({ health: 370, shield: 370, power: 150 });
  });

  it('scales necramechs by product_category or /EntratiMech/ path', () => {
    const bonewidow = scaleAvatarStatsToMaxRank({
      unique_name: '/Lotus/Powersuits/EntratiMech/ThanoTech',
      product_category: 'MechSuits',
      health: 1880,
      shield: 430,
      armor: 480,
      power: 175,
    });
    expect(bonewidow).toMatchObject({ health: 2880, shield: 630, power: 225, armor: 480 });

    expect(getRank30Bonuses('/Lotus/Powersuits/EntratiMech/NechroTech')).toEqual({
      health: 1000,
      shield: 200,
      energy: 50,
      armor: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';

import { GEAR_SLOTS } from './catalog.ts';
import { optimizeLoadouts, optimizeLoadoutsAsync, type OptimizerRequest } from './optimizer.ts';
import type { GearPieceInput } from './pieceStats.ts';

const hero = {
  hp: 10000,
  atk: 2000,
  def: 1000,
  atkInterval: 2.6,
  rrAuto: 10,
  rrAttack: 8,
  rrAttacked: 6,
};

function piece(
  id: number,
  slot: GearPieceInput['slot'],
  setKey: string,
  extras: Partial<GearPieceInput> = {},
): GearPieceInput {
  return {
    id,
    slot,
    setKey,
    mainStat: slot === 'armor' ? 'hp' : slot === 'weapon' ? 'atk' : 'atkBonus',
    mainValue: slot === 'armor' ? 2000 : slot === 'weapon' ? 400 : 40,
    mainBonus: 0,
    substats: [],
    equippedHeroSlug: null,
    ...extras,
  };
}

describe('optimizeLoadouts', () => {
  it('returns empty when a slot is missing', () => {
    const request: OptimizerRequest = {
      hero,
      pieces: [piece(1, 'weapon', 'calamity')],
      weights: { atk: 100 },
      minimums: {},
      forceSets: false,
    };
    expect(optimizeLoadouts(request)).toEqual([]);
  });

  it('keeps pieces that reach a crit rate floor and ranks by ATK', () => {
    const request: OptimizerRequest = {
      hero,
      pieces: [
        piece(1, 'weapon', 'calamity', { substats: [{ stat: 'atk', value: 400 }] }),
        piece(2, 'weapon', 'calamity', { substats: [{ stat: 'atk', value: 100 }] }),
        piece(3, 'armor', 'calamity'),
        piece(4, 'bangle', 'the_insight', {
          mainStat: 'critRate',
          mainValue: 30,
          substats: [{ stat: 'critRate', value: 20 }],
        }),
        piece(5, 'amulet', 'the_insight', { substats: [{ stat: 'critRate', value: 20 }] }),
        piece(6, 'ring', 'the_insight', { substats: [{ stat: 'critRate', value: 15 }] }),
        piece(7, 'bangle', 'fatality', { substats: [{ stat: 'atkBonus', value: 30 }] }),
        piece(8, 'amulet', 'fatality', { substats: [{ stat: 'atkBonus', value: 30 }] }),
        piece(9, 'ring', 'fatality', { substats: [{ stat: 'atkBonus', value: 30 }] }),
      ],
      weights: { atk: 100 },
      minimums: { critRate: 95 },
      forceSets: false,
    };
    const results = optimizeLoadouts(request);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.stats.critRate).toBeGreaterThanOrEqual(95);
    expect(results[0]?.pieces.find((entry) => entry.slot === 'weapon')?.id).toBe(1);
  });

  it('excludes other heroes equipped gear unless includeEquippedHeroSlug matches', () => {
    const pieces = [
      piece(1, 'weapon', 'calamity', { equippedHeroSlug: 'other' }),
      piece(2, 'weapon', 'calamity'),
      piece(3, 'armor', 'calamity'),
      piece(4, 'bangle', 'fatality'),
      piece(5, 'amulet', 'fatality'),
      piece(6, 'ring', 'fatality'),
    ];
    const blocked = optimizeLoadouts({
      hero,
      pieces,
      weights: { atk: 10 },
      minimums: {},
      forceSets: false,
    });
    expect(blocked[0]?.pieces.some((entry) => entry.id === 1)).toBe(false);

    const included = optimizeLoadouts({
      hero,
      pieces,
      weights: { atk: 10 },
      minimums: {},
      forceSets: false,
      includeEquippedHeroSlug: 'other',
    });
    expect(included[0]?.pieces.some((entry) => entry.id === 1)).toBe(true);

    const others = optimizeLoadouts({
      hero,
      pieces,
      weights: { atk: 10 },
      minimums: {},
      forceSets: false,
      includeOthersEquipped: true,
      heroSlug: 'self',
    });
    expect(others[0]?.pieces.some((entry) => entry.id === 1)).toBe(true);

    const skipSelf = optimizeLoadouts({
      hero,
      pieces: pieces.map((entry) => (entry.id === 1 ? { ...entry, equippedHeroSlug: 'self' } : entry)),
      weights: { atk: 10 },
      minimums: {},
      forceSets: false,
      includeOthersEquipped: true,
      heroSlug: 'self',
    });
    expect(skipSelf[0]?.pieces.some((entry) => entry.id === 1)).toBe(false);
  });

  it('returns empty when Force sets cannot fill every slot from those sets', () => {
    const results = optimizeLoadouts({
      hero,
      pieces: [
        piece(1, 'weapon', 'calamity'),
        piece(2, 'armor', 'whirlwind'),
        piece(3, 'bangle', 'fatality'),
        piece(4, 'amulet', 'fatality'),
        piece(5, 'ring', 'fatality'),
      ],
      weights: { atk: 100 },
      minimums: {},
      desiredLeftSet: 'calamity',
      desiredRightSet: 'fatality',
      forceSets: true,
    });
    expect(results).toEqual([]);
  });

  it('keeps a high-HP armor that an ATK-only beam would drop when combos exceed 2M', () => {
    const pieces: GearPieceInput[] = [];
    let id = 1;
    let hpArmorId = 0;
    for (const slot of GEAR_SLOTS) {
      for (let index = 0; index < 20; index += 1) {
        const isHpArmor = slot === 'armor' && index === 19;
        if (isHpArmor) hpArmorId = id;
        pieces.push(
          piece(id, slot, slot === 'weapon' || slot === 'armor' ? 'calamity' : 'fatality', {
            mainValue: isHpArmor ? 4000 : slot === 'armor' ? 2000 : slot === 'weapon' ? 400 : 40,
            substats: isHpArmor ? [] : [{ stat: 'atk', value: 500 - index }],
          }),
        );
        id += 1;
      }
    }
    const results = optimizeLoadouts({
      hero,
      pieces,
      weights: { atk: 100 },
      minimums: { hp: 13000 },
      forceSets: false,
    });
    expect(hpArmorId).toBeGreaterThan(0);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.stats.hp).toBeGreaterThanOrEqual(13000);
    expect(results[0]?.pieces.find((entry) => entry.slot === 'armor')?.id).toBe(hpArmorId);
  }, 60_000);

  it('does not rank extra crit above 100% over ATK when both loadouts already cap', () => {
    const request: OptimizerRequest = {
      hero,
      pieces: [
        piece(1, 'weapon', 'calamity', { substats: [{ stat: 'atk', value: 500 }] }),
        piece(2, 'weapon', 'calamity', { substats: [{ stat: 'critRate', value: 25 }] }),
        piece(3, 'armor', 'calamity'),
        piece(4, 'bangle', 'the_insight', {
          mainStat: 'critRate',
          mainValue: 40,
          substats: [{ stat: 'critRate', value: 30 }],
        }),
        piece(5, 'amulet', 'the_insight', { substats: [{ stat: 'critRate', value: 30 }] }),
        piece(6, 'ring', 'the_insight', { substats: [{ stat: 'critRate', value: 30 }] }),
      ],
      weights: { atk: 100, critRate: 100 },
      minimums: { critRate: 100 },
      forceSets: false,
    };
    const results = optimizeLoadouts(request);
    expect(results[0]?.stats.critRate).toBeGreaterThanOrEqual(100);
    expect(results[0]?.pieces.find((entry) => entry.slot === 'weapon')?.id).toBe(1);
  });

  it('scores a 10% ATK gain the same as a 10% HP gain at equal weight', () => {
    const shared = [
      piece(3, 'armor', 'life_force', { mainValue: 0 }),
      piece(4, 'bangle', 'hawk_eye', { mainStat: 'hpBonus', mainValue: 0 }),
      piece(5, 'amulet', 'hawk_eye', { mainStat: 'hpBonus', mainValue: 0 }),
      piece(6, 'ring', 'hawk_eye', { mainStat: 'hpBonus', mainValue: 0 }),
    ];
    const request = {
      hero,
      weights: { atk: 10, hp: 10 },
      minimums: {},
      forceSets: false,
    };
    const atk = optimizeLoadouts({
      ...request,
      pieces: [
        piece(1, 'weapon', 'life_force', {
          mainValue: 0,
          substats: [{ stat: 'atk', value: hero.atk * 0.1 }],
        }),
        ...shared,
      ],
    });
    const hp = optimizeLoadouts({
      ...request,
      pieces: [
        piece(1, 'weapon', 'life_force', {
          mainValue: 0,
          substats: [{ stat: 'hp', value: hero.hp * 0.1 }],
        }),
        ...shared,
      ],
    });
    expect(atk[0]?.score).toBeCloseTo(hp[0]?.score ?? Number.NaN, 6);
  });

  it('reports search progress from the async path', async () => {
    const ticks: Array<[number, number]> = [];
    const results = await optimizeLoadoutsAsync(
      {
        hero,
        pieces: [
          piece(1, 'weapon', 'calamity'),
          piece(2, 'armor', 'calamity'),
          piece(3, 'bangle', 'fatality'),
          piece(4, 'amulet', 'fatality'),
          piece(5, 'ring', 'fatality'),
        ],
        weights: { atk: 10 },
        minimums: {},
        forceSets: false,
      },
      (done, total) => ticks.push([done, total]),
    );
    expect(results).toHaveLength(1);
    expect(ticks[0]).toEqual([0, 1]);
    expect(ticks.at(-1)).toEqual([1, 1]);
  });

  it('stops the async search once the signal aborts', async () => {
    const pieces: GearPieceInput[] = [];
    let id = 1;
    for (const slot of GEAR_SLOTS) {
      for (let index = 0; index < 8; index += 1) {
        pieces.push(piece(id, slot, 'calamity'));
        id += 1;
      }
    }
    const controller = new AbortController();
    let lastDone = 0;
    await expect(
      optimizeLoadoutsAsync(
        { hero, pieces, weights: { atk: 10 }, minimums: {}, forceSets: false },
        (done) => {
          lastDone = done;
          controller.abort();
        },
        controller.signal,
      ),
    ).rejects.toThrow();
    expect(lastDone).toBeLessThan(8 ** 5);
  });

  it('matches exhaustive brute-force across mixed sets, substats, and minimums', () => {
    const sets = ['calamity', 'warlord', 'soulboundArcana', 'infernalRoar', 'wisdom', 'whirlwind'];
    const pieces: GearPieceInput[] = [];
    let id = 1;
    let seed = 1337;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    for (const slot of GEAR_SLOTS) {
      for (let i = 0; i < 4; i += 1) {
        const setKey = sets[Math.floor(nextRand() * sets.length)] ?? 'calamity';
        pieces.push({
          id: id++,
          slot,
          setKey,
          mainStat: slot === 'weapon' ? 'atk' : slot === 'armor' ? 'hp' : i % 2 === 0 ? 'atkBonus' : 'critDmg',
          mainValue: slot === 'weapon' ? 350 + i * 25 : slot === 'armor' ? 1800 + i * 100 : 30 + i * 5,
          mainBonus: i % 3 === 0 ? 5 : 0,
          substats: [
            { stat: 'critRate', value: Math.round(nextRand() * 25) },
            { stat: 'critDmg', value: Math.round(nextRand() * 30) },
            { stat: 'atkBonus', value: Math.round(nextRand() * 20) },
            { stat: 'atkSpd', value: Math.round(nextRand() * 45) },
          ],
          equippedHeroSlug: null,
        });
      }
    }

    const weights = {
      atk: 10,
      critRate: 8,
      critDmg: 7,
      atkSpd: 6,
      damageOnUlt: 9,
      basicAtkDamage: 5,
    };
    const minimums = { critRate: 40 };

    const actual = optimizeLoadouts({
      hero,
      pieces,
      weights,
      minimums,
      forceSets: false,
    });

    // Reference brute-force: score every 5-piece combination individually (no pruning possible).
    const bySlot = Object.fromEntries(
      GEAR_SLOTS.map((slot) => [slot, pieces.filter((p) => p.slot === slot)]),
    ) as Record<(typeof GEAR_SLOTS)[number], GearPieceInput[]>;
    const brute: number[] = [];
    for (const w of bySlot.weapon) {
      for (const a of bySlot.armor) {
        for (const b of bySlot.bangle) {
          for (const m of bySlot.amulet) {
            for (const r of bySlot.ring) {
              const single = optimizeLoadouts({
                hero,
                pieces: [w, a, b, m, r],
                weights,
                minimums,
                forceSets: false,
              });
              if (single[0]) brute.push(single[0].score);
            }
          }
        }
      }
    }
    brute.sort((x, y) => y - x);
    expect(brute.length).toBeGreaterThanOrEqual(3);
    expect(actual).toHaveLength(3);
    expect(actual[0]?.score).toBeCloseTo(brute[0] ?? 0, 5);
    expect(actual[1]?.score).toBeCloseTo(brute[1] ?? 0, 5);
    expect(actual[2]?.score).toBeCloseTo(brute[2] ?? 0, 5);
  });
});

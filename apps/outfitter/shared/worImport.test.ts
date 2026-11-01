import { describe, expect, it } from 'vitest';

import { planWorImport, type CatalogArtifactRef, type StashArtifact, type StashGear } from './worImport.ts';

const catalog: CatalogArtifactRef[] = [{ slug: 'absolution', name: 'Absolution', rarity: 'mythic', star_rating: 6 }];

function gear(uid: number, level = 16, hero?: number) {
  return {
    uid,
    level,
    slot: 'weapon',
    suit_name: 'Life Force',
    main_stat: 'atk',
    main_value: 1000,
    main_bonus: 0,
    sub_stats: [
      { stat: 'hp', value: 100 },
      { stat: 'def', value: 40 },
      { stat: 'atkSpd', value: 10 },
      { stat: 'critRate', value: 5 },
    ],
    hero_id: hero,
  };
}

function stashGear(id: number, game_uid: string | null, main = 1000): StashGear {
  return {
    id,
    game_uid,
    slot: 'weapon',
    set_key: 'life_force',
    main_stat: 'atk',
    main_value: main,
    main_bonus: 0,
    sub1_stat: 'hp',
    sub1_value: 100,
    sub2_stat: 'def',
    sub2_value: 40,
    sub3_stat: 'atkSpd',
    sub3_value: 10,
    sub4_stat: 'critRate',
    sub4_value: 5,
  };
}

const options = { gearMode: 'sync' as const, artifactMode: 'skip' as const, plus16Only: false };

describe('planWorImport', () => {
  it('rejects a file that still uses numeric stat ids', () => {
    const result = planWorImport(
      { gear: [{ uid: 1, slot: 0, main_stats: [{ id: 1, value: 100 }] }] },
      [],
      [],
      catalog,
      options,
    );
    expect('error' in result && result.error).toMatch(/numeric stat ids/);
  });

  it('names a set from its suit id', () => {
    const piece = gear(3);
    delete (piece as { suit_name?: string }).suit_name;
    const result = planWorImport({ gear: [{ ...piece, suit_id: 710900, slot: 'weapon' }] }, [], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.add[0]?.write.set_key).toBe('whirlwind');
  });

  it('marks hero exclusive gear and faction rings from the item id', () => {
    const hex = { ...gear(11), suit_name: 'Wicked Vengeance', item_id: 220500 };
    const ring = {
      ...gear(12),
      slot: 'ring',
      main_stat: 'atkBonus',
      main_value: 66,
      suit_name: 'Cataclysm',
      item_id: 103003,
    };
    const result = planWorImport({ gear: [hex, ring] }, [], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.add.map((row) => row.write)).toMatchObject([
      { set_key: 'wicked_vengeance', exclusive_hero_slug: 'hex', exclusive_faction: null },
      { set_key: 'cataclysm', exclusive_hero_slug: null, exclusive_faction: 'nightmare_council' },
    ]);
  });

  it('reads Goldmane as ancient and Night Terror from the suit id', () => {
    const ancient = {
      ...gear(4),
      slot: 'armor',
      main_stat: 'hp',
      main_value: 3960,
      suit_name: undefined,
      suit_id: 712000,
      quality: 8,
    };
    const terror = { ...gear(5), slot: 'ring', main_stat: 'critDmg', suit_name: undefined, suit_id: 721100 };
    const result = planWorImport({ gear: [ancient, terror] }, [], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    const keys = result.plan.gear.add.map((row) => [row.write.set_key, row.write.prefix]);
    expect(keys).toEqual([
      ['goldmane', 'ancient'],
      ['night_terror', 'none'],
    ]);
  });

  it('rejects a piece missing subs and still plans a complete one', () => {
    const result = planWorImport({ gear: [gear(1), { ...gear(2), sub_stats: [] }] }, [], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.add.map((row) => row.game_uid)).toEqual(['1']);
    expect(result.plan.gear.rejected).toEqual([{ uid: '2', reason: 'Missing a main stat or four subs.' }]);
    expect(result.plan.warnings.some((line) => line.includes('missing a main stat'))).toBe(true);
  });

  it('matches a stored uid and leaves identical stats alone', () => {
    const result = planWorImport({ gear: [gear(7)] }, [stashGear(4, '7')], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.unchanged).toBe(1);
    expect(result.plan.gear.add).toEqual([]);
    expect(result.plan.gear.links).toEqual([]);
  });

  it('pairs a hand-typed piece by stats and keeps the second twin as new', () => {
    const result = planWorImport({ gear: [gear(8), gear(9)] }, [stashGear(4, null)], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.links).toEqual([{ id: 4, game_uid: '8' }]);
    expect(result.plan.gear.add.map((row) => row.game_uid)).toEqual(['9']);
    expect(result.plan.gear.unchanged).toBe(1);
  });

  it('updates a uid match when the stats changed', () => {
    const result = planWorImport({ gear: [gear(7)] }, [stashGear(4, '7', 50)], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.update.map((row) => row.match_id)).toEqual([4]);
  });

  it('hides outfitter-only rows while the +16 filter is on', () => {
    const result = planWorImport({ gear: [gear(1, 0), gear(2, 16)] }, [stashGear(4, '99')], [], catalog, {
      ...options,
      plus16Only: true,
    });
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.add.map((row) => row.game_uid)).toEqual(['2']);
    expect(result.plan.gear.missing).toEqual([]);
    expect(result.plan.skipped_below_16).toBe(1);
  });

  it('lists outfitter-only rows when the filter is off', () => {
    const result = planWorImport({ gear: [gear(2)] }, [stashGear(4, '99')], [], catalog, options);
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.missing).toEqual([{ id: 4, label: 'life_force weapon' }]);
  });

  it('names the wipe on restore and imports unequipped when the hero is unknown', () => {
    const result = planWorImport({ gear: [gear(2, 16, 238200001)] }, [stashGear(4, null)], [], catalog, {
      ...options,
      gearMode: 'restore',
    });
    if ('error' in result) throw new Error(result.error);
    expect(result.plan.gear.wipe_count).toBe(1);
    expect(result.plan.gear.add[0]?.write.exclusive_hero_slug).toBeNull();
    expect(result.plan.unknown_hero_ids).toEqual([238200001]);
    expect(result.plan.warnings.some((line) => line.includes('deletes all 1'))).toBe(true);
  });

  it('uses mythic caps at +25 stage 5 and keeps typed bases below that', () => {
    const low: StashArtifact = {
      id: 3,
      game_uid: null,
      catalog_slug: 'absolution',
      level: 10,
      promotion: 0,
      hp_base: 2200,
      hp_bonus: 0,
      atk_base: 777,
      atk_bonus: 0,
      secondary_stat: null,
      secondary_value: null,
    };
    const result = planWorImport(
      {
        gear: [],
        artifacts: [
          { uid: 5, name: 'Absolution', level: 25, stage: 5, refine_stats: [{ stat: 'hp', value: 100 }] },
          { uid: 6, name: 'Absolution', level: 10, stage: 0, refine_stats: [], dark_stats: [] },
        ],
      },
      [],
      [low],
      catalog,
      { gearMode: 'skip', artifactMode: 'sync', plus16Only: false },
    );
    if ('error' in result) throw new Error(result.error);
    const added = result.plan.artifacts.add[0];
    expect(added?.write.hp_base).toBe(4650);
    expect(added?.write.atk_base).toBe(1497);
    expect(added?.write.hp_bonus).toBe(100);
    expect(result.plan.artifacts.links).toEqual([{ id: 3, game_uid: '6' }]);
    expect(result.plan.warnings.some((line) => line.includes('saved as 0'))).toBe(true);
  });
});

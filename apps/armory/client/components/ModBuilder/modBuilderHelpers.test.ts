import { describe, expect, it } from 'vitest';

import type { ModSlot } from '../../types/warframe';
import {
  applySetPieceDelta,
  applySetRankDelta,
  clampSetRank,
  getAbilityName,
  modBuilderPersistFingerprint,
} from './modBuilderHelpers';

function setSlot(index: number, setName: string, maxInSet: number, setRank?: number): ModSlot {
  return {
    index,
    type: 'general',
    setRank,
    mod: {
      unique_name: `/mod/${setName}/${index}`,
      name: `${setName} ${index}`,
      mod_set: setName,
      set_stats: JSON.stringify(['+10%']),
      set_num_in_set: maxInSet,
    },
  };
}

describe('modBuilderHelpers', () => {
  it('increments and decrements shared setRank across set pieces as pieces are added or removed', () => {
    const first = [setSlot(0, 'Umbral', 3, 1)];
    const added = applySetPieceDelta(first, [setSlot(0, 'Umbral', 3, 1), setSlot(1, 'Umbral', 3)]);
    expect(added.map((s) => s.setRank)).toEqual([2, 2]);

    const addedThird = applySetPieceDelta(added, [...added, setSlot(2, 'Umbral', 3)]);
    expect(addedThird.map((s) => s.setRank)).toEqual([3, 3, 3]);

    const removedOne = applySetPieceDelta(addedThird, addedThird.slice(0, 2));
    expect(removedOne.map((s) => s.setRank)).toEqual([2, 2]);
  });

  it('clamps manual set rank deltas within [1, set_num_in_set] without touching other sets', () => {
    const slots = [setSlot(0, 'Umbral', 3, 2), setSlot(1, 'Augur', 6, 1)];
    expect(clampSetRank(slots[0]!, 99)).toBe(3);
    expect(clampSetRank(slots[0]!, -1)).toBe(1);

    const raised = applySetRankDelta(slots, 'Umbral', 5, 1);
    expect(raised[0]?.setRank).toBe(3);
    expect(raised[1]?.setRank).toBe(1);
  });

  it('falls back cleanly on malformed abilities JSON and changes persist fingerprint when build fields change', () => {
    expect(getAbilityName({ abilities: '{broken' } as never, 0)).toBe('Ability 1');
    expect(getAbilityName({ abilities: JSON.stringify([{ abilityName: 'Roar' }]) } as never, 0)).toBe('Roar');

    const base = {
      buildName: 'A',
      buildDescription: '',
      buildVisibility: 'private' as const,
      equipmentType: 'warframe' as const,
      equipmentUniqueName: '/wf/a',
      slots: [],
      helminthConfig: undefined,
      incarnonEnabled: false,
      incarnonSelections: undefined,
      arcaneSlots: [],
      shardSlots: [],
      orokinReactor: true,
      valenceBonus: null,
    };
    expect(modBuilderPersistFingerprint(base)).not.toBe(
      modBuilderPersistFingerprint({ ...base, buildVisibility: 'public' }),
    );
  });
});

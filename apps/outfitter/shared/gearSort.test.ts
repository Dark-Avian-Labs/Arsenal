import { describe, expect, it } from 'vitest';

import { compareInventoryGear } from './gearSort.ts';
import { ALL_SETS, INVENTORY_SET_KEYS, setsForSlot, setsSortedByTier } from './sets.ts';

describe('set ordering and slot filtering', () => {
  it('lists every set once in in-game bag order and orders setsSortedByTier by tier/side', () => {
    expect([...INVENTORY_SET_KEYS].sort()).toEqual(ALL_SETS.map((set) => set.key).sort());
    expect(INVENTORY_SET_KEYS[0]).toBe('greyfang');
    expect(INVENTORY_SET_KEYS.at(-1)).toBe('annihilating_might');

    const sorted = setsSortedByTier();
    const keys = sorted.map((set) => set.key);
    const tiers = sorted.map((set) => set.tier);
    expect(tiers.slice(1).every((tier, index) => tier >= (tiers[index] ?? 0))).toBe(true);
    expect(keys.indexOf('calamity')).toBeLessThan(keys.indexOf('fatality'));
    expect(keys.indexOf('warlord')).toBeLessThan(keys.indexOf('ageless_wrath'));

    const weaponSets = setsForSlot('weapon');
    expect(weaponSets.every((set) => set.side === 'left')).toBe(true);
    expect(weaponSets[0]?.tier).toBe(1);
    expect(weaponSets.at(-1)?.tier).toBe(3);
  });
});

describe('compareInventoryGear', () => {
  it('sorts variant before ancient before normal, then 3-piece before 2-piece, then bangle before weapon', () => {
    const pieces = [
      { prefix: 'none', set_key: 'calamity', slot: 'weapon' },
      { prefix: 'variant', set_key: 'guardian', slot: 'ring' },
      { prefix: 'ancient', set_key: 'greyfang', slot: 'weapon' },
      { prefix: 'variant', set_key: 'greyfang', slot: 'weapon' },
      { prefix: 'variant', set_key: 'greyfang', slot: 'bangle' },
      { prefix: 'ancient', set_key: 'goldmane', slot: 'armor' },
    ] as const;
    expect(
      [...pieces].sort(compareInventoryGear).map((piece) => `${piece.prefix}:${piece.set_key}:${piece.slot}`),
    ).toEqual([
      'variant:greyfang:bangle',
      'variant:greyfang:weapon',
      'variant:guardian:ring',
      'ancient:greyfang:weapon',
      'ancient:goldmane:armor',
      'none:calamity:weapon',
    ]);
  });
});

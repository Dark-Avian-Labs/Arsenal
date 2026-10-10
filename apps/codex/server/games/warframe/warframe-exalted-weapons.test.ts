import { describe, expect, it } from 'vitest';

import { isExaltedWeaponItem, shouldAutoCompleteOrokin } from './index.js';

describe('exalted weapon Orokin rules', () => {
  it('matches Armory exalted melee and primary names', () => {
    expect(isExaltedWeaponItem('Exalted Blade')).toBe(true);
    expect(isExaltedWeaponItem('Exalted Prime Blade')).toBe(true);
    expect(isExaltedWeaponItem('Artemis Bow Prime')).toBe(true);
  });

  it('does not treat ordinary prime gear as exalted', () => {
    expect(isExaltedWeaponItem('Braton Prime')).toBe(false);
    expect(isExaltedWeaponItem('Excalibur Prime')).toBe(false);
  });

  it('only applies on weapon worksheets', () => {
    expect(shouldAutoCompleteOrokin('Melee Weapons', 'Exalted Blade')).toBe(true);
    expect(shouldAutoCompleteOrokin('Warframes', 'Exalted Blade')).toBe(false);
  });
});

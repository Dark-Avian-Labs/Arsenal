import { describe, expect, it } from 'vitest';

import { ACCOUNT_COLORS, nextAccountColor, remapAccountColor } from './accountColors.ts';

describe('accountColors', () => {
  it('remaps legacy picker names, keeps ladder names, and falls back for unknown values', () => {
    expect(remapAccountColor('rose')).toBe('red');
    expect(remapAccountColor('amber')).toBe('gold');
    expect(remapAccountColor('lime')).toBe('green');
    expect(remapAccountColor('sky')).toBe('blue');
    expect(remapAccountColor('indigo')).toBe('blue');
    expect(remapAccountColor('violet')).toBe('purple');
    expect(remapAccountColor('fuchsia')).toBe('pink');
    for (const color of ACCOUNT_COLORS) {
      expect(remapAccountColor(color)).toBe(color);
    }
    expect(remapAccountColor('totally-unknown')).toBeNull();
  });

  it('picks the next unused ladder color and wraps cleanly when all colors are taken', () => {
    expect(nextAccountColor(['red', 'orange'])).toBe('gold');
    expect(ACCOUNT_COLORS).toContain(nextAccountColor([...ACCOUNT_COLORS]));
  });
});

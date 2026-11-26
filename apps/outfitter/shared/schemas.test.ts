import { describe, expect, it } from 'vitest';

import { parseArtifactBody, parseGearBody } from './schemas.ts';

describe('parseGearBody', () => {
  const validWeapon = {
    slot: 'weapon',
    set_key: 'calamity',
    prefix: 'ancient',
    main_stat: 'atk',
    main_value: 1056,
    main_bonus: 120,
    substats: [{ stat: 'critRate', value: 25 }],
  };

  it('accepts valid gear and rejects mismatched side/slot or invalid main stat', () => {
    const ok = parseGearBody(validWeapon);
    expect(typeof ok).toBe('object');

    // Right-side set on left-side slot
    expect(parseGearBody({ ...validWeapon, set_key: 'fatality' })).toMatch(/Set does not match/);
    // Unknown set
    expect(parseGearBody({ ...validWeapon, set_key: 'not_a_set' })).toBe('Unknown set.');
    // Invalid main stat for weapon
    expect(parseGearBody({ ...validWeapon, main_stat: 'hp' })).toMatch(/Invalid main stat/);
    // More than 4 substats
    expect(
      parseGearBody({
        ...validWeapon,
        substats: Array.from({ length: 5 }, () => ({ stat: 'atk', value: 10 })),
      }),
    ).toBe('At most 4 substats.');
  });

  it('enforces hero vs faction exclusive slot rules', () => {
    expect(
      parseGearBody({
        ...validWeapon,
        exclusive_hero_slug: 'silas',
        exclusive_faction: 'piercers',
      }),
    ).toMatch(/cannot both be set/i);

    expect(parseGearBody({ ...validWeapon, exclusive_faction: 'piercers' })).toMatch(/only valid on rings/i);

    expect(
      parseGearBody({
        slot: 'ring',
        set_key: 'fatality',
        main_stat: 'atkBonus',
        main_value: 60,
        exclusive_hero_slug: 'silas',
      }),
    ).toMatch(/not valid on rings/i);
  });
});

describe('parseArtifactBody', () => {
  const known = new Set(['golden-scarab']);

  it('validates known slug, promotion level cap, and secondary stat', () => {
    const ok = parseArtifactBody(
      {
        catalog_slug: 'golden-scarab',
        level: 25,
        promotion: 5,
        hp_base: 4650,
        atk_base: 1497,
        secondary_stat: 'atkSpd',
        secondary_value: 49,
      },
      known,
    );
    expect(typeof ok).toBe('object');

    expect(
      parseArtifactBody({ catalog_slug: 'unknown', level: 10, promotion: 0, hp_base: 1, atk_base: 1 }, known),
    ).toBe('Unknown artifact.');

    // Promotion 0 caps below level 25
    expect(
      parseArtifactBody({ catalog_slug: 'golden-scarab', level: 25, promotion: 0, hp_base: 1, atk_base: 1 }, known),
    ).toMatch(/above promotion 0 max/);

    expect(
      parseArtifactBody(
        {
          catalog_slug: 'golden-scarab',
          level: 10,
          promotion: 0,
          hp_base: 1,
          atk_base: 1,
          secondary_stat: 'fakeStat',
          secondary_value: 10,
        },
        known,
      ),
    ).toBe('Invalid secondary stat.');
  });
});

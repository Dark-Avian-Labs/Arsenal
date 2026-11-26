import { HELMINTH_REGISTRY_ENTRIES } from '@dark-avian-labs/warframe-catalog';
import { describe, expect, it } from 'vitest';

import { renderBuildCardSvg } from './buildCard.ts';
import { ModConfigSchema } from './routes/modConfigValidation.ts';

describe('renderBuildCardSvg', () => {
  it('renders ModConfigSchema-validated builds (slots, arcanes, helminth, reactor) and XML-escapes untrusted text', () => {
    const roar = HELMINTH_REGISTRY_ENTRIES.find((entry) => entry.name === 'Roar') ?? HELMINTH_REGISTRY_ENTRIES[0]!;

    const config = ModConfigSchema.parse({
      name: 'Steel Path <Saryn> & Friends',
      equipment_type: 'warframe',
      equipment_unique_name: '/Lotus/Powersuits/Saryn/SarynPrime',
      orokinReactor: true,
      helminth: {
        replaced_ability_key: '/Armory/Ability/Saryn/Molt',
        replacement_ability_key: roar.armory_key,
      },
      slots: [
        {
          index: 0,
          type: 'aura',
          rank: 5,
          polarity: 'AP_TACTIC',
          mod: { name: 'Corrosive Projection' },
        },
        {
          index: 1,
          type: 'exilus',
          rank: 5,
          polarity: 'AP_POWER',
          mod: { name: 'Primed Sure Footed' },
        },
        {
          index: 2,
          type: 'general',
          rank: 10,
          polarity: 'AP_ATTACK',
          mod: { name: 'Blind Rage' },
        },
      ],
      arcaneSlots: [
        {
          rank: 5,
          arcane: {
            unique_name: '/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneEnergize',
            name: 'Arcane Energize',
          },
        },
      ],
    });

    const svg = renderBuildCardSvg({
      buildName: 'Steel Path <Saryn> & Friends',
      equipmentName: 'Saryn Prime',
      equipmentType: 'warframe',
      ownerName: 'Tenno<One>',
      description: 'Max range spore spreader',
      modConfigRaw: JSON.stringify(config),
    });

    expect(svg).toContain('<svg ');
    expect(svg).toContain('Steel Path &lt;Saryn&gt; &amp; Friends');
    expect(svg).toContain('Tenno&lt;One&gt;');
    expect(svg).toContain('REACTOR / CATALYST');
    expect(svg).toContain('Corrosive Projection');
    expect(svg).toContain('>AURA<');
    expect(svg).toContain('>EXILUS<');
    expect(svg).toContain('Blind Rage');
    expect(svg).toContain('Arcane Energize');
    expect(svg).toContain(`HELMINTH: ${roar.name.toUpperCase()}`);
  });

  it('handles malformed JSON mod configs gracefully without throwing', () => {
    const svg = renderBuildCardSvg({
      buildName: '',
      equipmentName: '',
      equipmentType: 'primary',
      ownerName: '',
      description: null,
      modConfigRaw: '{not-valid-json',
    });

    expect(svg).toContain('Armory Build');
    expect(svg).toContain('0 equipped mods');
    expect(svg).toContain('Empty Slot');
  });
});

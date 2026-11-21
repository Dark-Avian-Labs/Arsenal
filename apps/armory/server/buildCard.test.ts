import { describe, expect, it } from 'vitest';

import { renderBuildCardSvg } from './buildCard.ts';

describe('renderBuildCardSvg', () => {
  it('renders build metadata, mods, arcanes, and XML-escapes untrusted text', () => {
    const svg = renderBuildCardSvg({
      buildName: 'Steel Path <Saryn> & Friends',
      equipmentName: 'Saryn Prime',
      equipmentType: 'warframe',
      ownerName: 'Tenno<One>',
      description: 'Max range spore spreader',
      modConfigRaw: JSON.stringify({
        orokinReactor: true,
        helminth: { abilityName: 'Roar' },
        slots: [
          { slotType: 'aura', rank: 5, polarity: 'AP_TACTIC', mod: { name: 'Corrosive Projection' } },
          { slotType: 'normal', rank: 10, polarity: 'AP_ATTACK', forma: true, mod: { name: 'Blind Rage' } },
        ],
        arcanes: [{ arcane: { name: 'Arcane Energize' } }],
      }),
    });

    expect(svg).toContain('<svg ');
    expect(svg).toContain('Steel Path &lt;Saryn&gt; &amp; Friends');
    expect(svg).toContain('Tenno&lt;One&gt;');
    expect(svg).toContain('Corrosive Projection');
    expect(svg).toContain('Blind Rage');
    expect(svg).toContain('Arcane Energize');
    expect(svg).toContain('1 FORMA');
    expect(svg).toContain('HELMINTH: ROAR');
  });
});

import { describe, expect, it } from 'vitest';

import { classifyArcaneCompatTags, isOperatorOnlyArcane } from './arcaneCompat.ts';

describe('classifyArcaneCompatTags', () => {
  it('classifies primary, secondary, melee, kitgun, zaw, and ordinary warframe arcanes', () => {
    expect(
      classifyArcaneCompatTags('/Lotus/Upgrades/EternalOnes/TheFragmented/TestLongbowSharpshoot', 'Longbow Sharpshoot'),
    ).toEqual(expect.arrayContaining(['primary']));
    expect(classifyArcaneCompatTags('/Lotus/Test', 'Primary Deadhead')).toContain('primary');
    expect(classifyArcaneCompatTags('/Lotus/Test', 'Secondary Merciless')).toContain('secondary');
    expect(classifyArcaneCompatTags('/Lotus/Test', 'Melee Influence')).toContain('melee');
    expect(classifyArcaneCompatTags('/Lotus/Test', 'Pax Seeker')).toEqual(
      expect.arrayContaining(['kitgun', 'secondary']),
    );
    expect(classifyArcaneCompatTags('/Lotus/Test', 'Exodia Contagion')).toEqual(
      expect.arrayContaining(['zaw', 'melee']),
    );
    expect(
      classifyArcaneCompatTags('/Lotus/Upgrades/CosmeticEnhancers/Offensive/ArcaneEnergize', 'Arcane Energize'),
    ).toEqual(['warframe']);
  });

  it('never tags operator-only export arcanes as warframe', () => {
    const operatorOnly = [
      ['/Lotus/Upgrades/CosmeticEnhancers/OperatorArmour/ArmourOnOperatorMode', 'Magus Husk'],
      ['/Lotus/Upgrades/CosmeticEnhancers/OperatorArmour/DamageReductionOnVoidMode', 'Magus Firewall'],
      ['/Lotus/Upgrades/CosmeticEnhancers/OperatorArmour/HealthOnOperatorMode', 'Magus Vigor'],
      ['/Lotus/Upgrades/CosmeticEnhancers/OperatorAmps/AttackSpeedOnKill', 'Virtuos Tempo'],
      ['/Lotus/Upgrades/CosmeticEnhancers/OperatorAmps/OperatorAmmoRegenOnKill', 'Virtuos Null'],
      ['/Lotus/Upgrades/CosmeticEnhancers/OperatorAmps/VoidToElectricDamage', 'Virtuos Surge'],
    ] as const;
    for (const [uniqueName, name] of operatorOnly) {
      expect(isOperatorOnlyArcane(uniqueName, name)).toBe(true);
      expect(classifyArcaneCompatTags(uniqueName, name)).not.toContain('warframe');
    }
  });
});

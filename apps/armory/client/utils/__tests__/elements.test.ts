import { describe, expect, it } from 'vitest';

import { calculateFinalDamage } from '../elements';

describe('calculateFinalDamage', () => {
  it('combines primary element mods in slot order (Cold + Toxin -> Viral, Heat stays standalone)', () => {
    const base = [100, 0, 0]; // 100 Impact
    const entries = calculateFinalDamage(base, [
      { slotIndex: 0, element: 'Cold', value: 60 },
      { slotIndex: 1, element: 'Toxin', value: 60 },
      { slotIndex: 2, element: 'Heat', value: 90 },
    ]);
    const byType = Object.fromEntries(entries.map((e) => [e.type, e.value]));
    expect(byType.Impact).toBe(100);
    expect(byType.Viral).toBe(120);
    expect(byType.Heat).toBe(90);
    expect(byType.Cold).toBeUndefined();
    expect(byType.Toxin).toBeUndefined();
  });

  it('merges innate primary elements last unless an earlier mod shares that element', () => {
    // Index 3 = Heat (innate 50 Heat)
    const base = [0, 0, 0, 50];
    const combinedWithMod = calculateFinalDamage(base, [{ slotIndex: 0, element: 'Toxin', value: 60 }]);
    const byType1 = Object.fromEntries(combinedWithMod.map((e) => [e.type, e.value]));
    expect(byType1.Gas).toBe(110);

    // Mod order Cold + Toxin combines into Viral, leaving innate Heat standalone.
    const leftoverInnate = calculateFinalDamage(base, [
      { slotIndex: 0, element: 'Cold', value: 60 },
      { slotIndex: 1, element: 'Toxin', value: 60 },
    ]);
    const byType2 = Object.fromEntries(leftoverInnate.map((e) => [e.type, e.value]));
    expect(byType2.Viral).toBe(120);
    expect(byType2.Heat).toBe(50);
  });

  it('routes all element mod damage to elementalConversionTarget when set', () => {
    const entries = calculateFinalDamage(
      [100, 0, 0],
      [
        { slotIndex: 0, element: 'Cold', value: 60 },
        { slotIndex: 1, element: 'Toxin', value: 60 },
      ],
      {},
      { elementalConversionTarget: 'Heat' },
    );
    const byType = Object.fromEntries(entries.map((e) => [e.type, e.value]));
    expect(byType.Heat).toBe(120);
    expect(byType.Viral).toBeUndefined();
  });
});

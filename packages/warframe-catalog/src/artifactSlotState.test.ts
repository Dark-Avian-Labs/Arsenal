import { describe, expect, it } from 'vitest';

import {
  AP_DISABLED,
  hasMeaningfulArtifactSlotOverrides,
  isArtifactSlotVisible,
  isWarframeSecondAuraSlotActive,
  normalizeWarframeArtifactSlotsForLoad,
  warframeExilusArtifactIndex,
  warframeSecondAuraApFromStorage,
  warframeUsesExtendedArtifactLayout,
} from './artifactSlotState.ts';
import {
  artifactSlotsStorageLength,
  EQUIPMENT_SLOT_CONFIGS,
  equipmentExilusArtifactIndex,
  MAX_ARTIFACT_SLOTS_STORAGE_LENGTH,
} from './equipmentSlotConfig.ts';

describe('equipmentSlotConfig', () => {
  it('computes storage length and exilus indices across equipment types including Jade dual-aura and beast claws', () => {
    expect(artifactSlotsStorageLength(EQUIPMENT_SLOT_CONFIGS.warframe)).toBe(10);
    expect(artifactSlotsStorageLength(EQUIPMENT_SLOT_CONFIGS.warframe, { hasSecondAura: true })).toBe(11);
    expect(artifactSlotsStorageLength(EQUIPMENT_SLOT_CONFIGS.primary)).toBe(9);
    expect(artifactSlotsStorageLength(EQUIPMENT_SLOT_CONFIGS.beast_claws)).toBe(9);
    expect(artifactSlotsStorageLength(EQUIPMENT_SLOT_CONFIGS.necramech)).toBe(12);
    expect(MAX_ARTIFACT_SLOTS_STORAGE_LENGTH).toBe(12);

    expect(equipmentExilusArtifactIndex(EQUIPMENT_SLOT_CONFIGS.primary)).toBe(8);
    expect(equipmentExilusArtifactIndex(EQUIPMENT_SLOT_CONFIGS.melee)).toBe(9);
  });
});

describe('hasMeaningfulArtifactSlotOverrides', () => {
  it('returns false for empty or all-universal placeholder arrays and true for real overrides', () => {
    expect(hasMeaningfulArtifactSlotOverrides([])).toBe(false);
    expect(hasMeaningfulArtifactSlotOverrides(Array(10).fill('AP_UNIVERSAL'))).toBe(false);
    expect(hasMeaningfulArtifactSlotOverrides(['AP_DEFENSE', ...Array(9).fill('AP_UNIVERSAL')])).toBe(true);
    expect(hasMeaningfulArtifactSlotOverrides([AP_DISABLED, 'AP_UNIVERSAL'])).toBe(true);
  });
});

describe('artifactSlotState', () => {
  it('hides AP_DISABLED slots when artifact data is present', () => {
    const slots = ['AP_UNIVERSAL', AP_DISABLED];
    expect(isArtifactSlotVisible(slots, 0, true)).toBe(true);
    expect(isArtifactSlotVisible(slots, 1, true)).toBe(false);
  });

  it('treats compact 10-slot layouts as no second aura and 11-slot layouts as extended', () => {
    const compact = Array.from({ length: 10 }, () => 'AP_UNIVERSAL');
    expect(warframeUsesExtendedArtifactLayout(compact)).toBe(false);
    expect(warframeSecondAuraApFromStorage(compact)).toBe(AP_DISABLED);
    expect(isWarframeSecondAuraSlotActive(compact)).toBe(false);
    expect(warframeExilusArtifactIndex(compact)).toBe(9);

    const extended = [...Array.from({ length: 8 }, () => 'AP_UNIVERSAL'), 'AP_ANY', 'AP_DEFENSE', 'AP_UNIVERSAL'];
    expect(warframeUsesExtendedArtifactLayout(extended)).toBe(true);
    expect(warframeSecondAuraApFromStorage(extended)).toBe('AP_DEFENSE');
    expect(isWarframeSecondAuraSlotActive(extended)).toBe(true);
    expect(warframeExilusArtifactIndex(extended)).toBe(10);
  });

  it('keeps Jade-like 11-slot rows when exilus has a polarity and folds mistaken padded 11-slot rows to 10', () => {
    const jadeLike = [...Array.from({ length: 8 }, () => 'AP_UNIVERSAL'), 'AP_ANY', 'AP_UNIVERSAL', 'AP_ANY'];
    expect(normalizeWarframeArtifactSlotsForLoad(jadeLike)).toHaveLength(11);
    expect(isWarframeSecondAuraSlotActive(jadeLike)).toBe(true);

    const ashMistaken = [...Array.from({ length: 8 }, () => 'AP_UNIVERSAL'), 'AP_ANY', 'AP_UNIVERSAL', 'AP_UNIVERSAL'];
    const normalized = normalizeWarframeArtifactSlotsForLoad(ashMistaken);
    expect(normalized).toHaveLength(10);
    expect(normalized[9]).toBe('AP_UNIVERSAL');
    expect(warframeUsesExtendedArtifactLayout(ashMistaken)).toBe(false);
    expect(isWarframeSecondAuraSlotActive(ashMistaken)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  ORION_SUIT_UNIQUE_NAME,
  SIRIUS_ORION_PICKER_LABEL,
  SIRIUS_SUIT_UNIQUE_NAME,
  formatSiriusOrionBuildDisplayName,
  formatSiriusOrionWarframeHeading,
  getSiriusOrionSiblingForm,
  isPlayableWarframeCatalogItem,
  prepareSiriusOrionWarframePickerItems,
  resolveSiriusOrionUniqueNameFromScrapeName,
  siriusOrionEquipmentSaveName,
} from './siriusOrionRegistry.ts';

describe('siriusOrionRegistry', () => {
  it('filters playable warframes including Orion SpecialItems while excluding Sevagoth Shadow', () => {
    expect(
      isPlayableWarframeCatalogItem({
        unique_name: SIRIUS_SUIT_UNIQUE_NAME,
        product_category: 'Suits',
      }),
    ).toBe(true);
    expect(
      isPlayableWarframeCatalogItem({
        unique_name: ORION_SUIT_UNIQUE_NAME,
        product_category: 'SpecialItems',
      }),
    ).toBe(true);
    expect(
      isPlayableWarframeCatalogItem({
        unique_name: '/Lotus/Powersuits/Sevagoth/SevagothShadow',
        product_category: 'SpecialItems',
      }),
    ).toBe(false);
  });

  it('formats picker items, save names, and headings (with fallback for normal warframes)', () => {
    const items = prepareSiriusOrionWarframePickerItems([
      { unique_name: SIRIUS_SUIT_UNIQUE_NAME, name: 'Sirius & Orion' },
      { unique_name: ORION_SUIT_UNIQUE_NAME, name: 'Orion & Sirius' },
      { unique_name: '/Lotus/Powersuits/Excalibur/Excalibur', name: 'Excalibur' },
    ]);
    expect(items.map((item) => item.name)).toEqual([
      `${SIRIUS_ORION_PICKER_LABEL} (Sirius)`,
      `${SIRIUS_ORION_PICKER_LABEL} (Orion)`,
      'Excalibur',
    ]);

    expect(formatSiriusOrionBuildDisplayName(SIRIUS_SUIT_UNIQUE_NAME)).toBe(`${SIRIUS_ORION_PICKER_LABEL} (Sirius)`);
    expect(
      siriusOrionEquipmentSaveName({
        unique_name: ORION_SUIT_UNIQUE_NAME,
        name: 'Orion & Sirius',
      }),
    ).toBe(`${SIRIUS_ORION_PICKER_LABEL} (Orion)`);
    expect(
      formatSiriusOrionWarframeHeading({
        unique_name: '/Lotus/Powersuits/Excalibur/Excalibur',
        name: 'Excalibur',
      }),
    ).toBe('Excalibur');
  });

  it('resolves scrape aliases and sibling forms', () => {
    expect(resolveSiriusOrionUniqueNameFromScrapeName('Sirius & Orion')).toBe(SIRIUS_SUIT_UNIQUE_NAME);
    expect(resolveSiriusOrionUniqueNameFromScrapeName('Orion & Sirius')).toBe(ORION_SUIT_UNIQUE_NAME);
    expect(getSiriusOrionSiblingForm(SIRIUS_SUIT_UNIQUE_NAME)?.uniqueName).toBe(ORION_SUIT_UNIQUE_NAME);
    expect(getSiriusOrionSiblingForm(ORION_SUIT_UNIQUE_NAME)?.uniqueName).toBe(SIRIUS_SUIT_UNIQUE_NAME);
  });
});

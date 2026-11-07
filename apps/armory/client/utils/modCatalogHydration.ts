import type { Mod, ModSlot } from '../types/warframe';
import { isRivenMod } from './riven';
import { ARMORY_STANCE_WIKI_IMAGE_PREFIX } from './specialItems';

function preferNonEmpty<T extends string | undefined>(
  primary: T | null | undefined,
  fallback: T | null | undefined,
): T | undefined {
  if (primary != null && String(primary).trim() !== '') return primary;
  return fallback ?? primary ?? undefined;
}

export function catalogKeyForMod(mod: Pick<Mod, 'name' | 'type'>): string {
  const t = (mod.type ?? '').trim().toUpperCase();
  return `${mod.name ?? ''}|||${t}`;
}

function mergeModImagePath(stored: Mod, catalog: Mod): string | undefined {
  const st = stored.image_path?.trim();
  const cat = catalog.image_path?.trim();
  if (cat?.startsWith(ARMORY_STANCE_WIKI_IMAGE_PREFIX)) return cat;
  if (st?.startsWith(ARMORY_STANCE_WIKI_IMAGE_PREFIX)) return st;
  return preferNonEmpty(catalog.image_path, stored.image_path);
}

export function mergeModWithCatalog(stored: Mod, catalog?: Mod): Mod {
  if (!catalog || isRivenMod(stored)) return stored;
  return {
    ...stored,
    ...catalog,
    unique_name: stored.unique_name,
    mod_set: preferNonEmpty(catalog.mod_set, stored.mod_set),
    set_num_in_set: catalog.set_num_in_set ?? stored.set_num_in_set,
    set_stats: preferNonEmpty(catalog.set_stats, stored.set_stats),
    description: preferNonEmpty(catalog.description, stored.description),
    fusion_limit: catalog.fusion_limit ?? stored.fusion_limit,
    base_drain: catalog.base_drain ?? stored.base_drain,
    polarity: preferNonEmpty(catalog.polarity, stored.polarity),
    rarity: preferNonEmpty(catalog.rarity, stored.rarity),
    image_path: mergeModImagePath(stored, catalog),
    atragraph_card_path: preferNonEmpty(catalog.atragraph_card_path, stored.atragraph_card_path),
    foil_overlay_path: preferNonEmpty(catalog.foil_overlay_path, stored.foil_overlay_path),
    compat_name: preferNonEmpty(catalog.compat_name, stored.compat_name),
    type: preferNonEmpty(catalog.type, stored.type),
    is_utility: catalog.is_utility ?? stored.is_utility,
    subtype: preferNonEmpty(catalog.subtype, stored.subtype),
    is_augment: catalog.is_augment ?? stored.is_augment,
    name: catalog.name || stored.name,
  };
}

export function hydrateSlotsWithModCatalog(
  slots: ModSlot[],
  catalogByUnique: Map<string, Mod>,
  catalogByNameAndType?: Map<string, Mod>,
): ModSlot[] {
  return slots.map((slot) => {
    if (!slot.mod) return slot;
    let catalog = catalogByUnique.get(slot.mod.unique_name);
    if (!catalog && catalogByNameAndType) {
      catalog = catalogByNameAndType.get(catalogKeyForMod(slot.mod));
      if (!catalog && slot.mod.name) {
        catalog = catalogByNameAndType.get(`${slot.mod.name}|||`);
      }
    }
    const merged = mergeModWithCatalog(slot.mod, catalog);
    return merged === slot.mod ? slot : { ...slot, mod: merged };
  });
}

export function slimSlotsForSave(slots: ModSlot[], catalogByUnique: Map<string, Mod>): ModSlot[] {
  return slots.map((slot) => {
    const mod = slot.mod;
    if (!mod || isRivenMod(mod) || !catalogByUnique.has(mod.unique_name)) return slot;
    return {
      ...slot,
      mod: {
        unique_name: mod.unique_name,
        name: mod.name,
        type: mod.type,
        // Slot placement checks read this before the catalog hydrates the build.
        ...(mod.is_utility != null ? { is_utility: mod.is_utility } : {}),
      },
    };
  });
}

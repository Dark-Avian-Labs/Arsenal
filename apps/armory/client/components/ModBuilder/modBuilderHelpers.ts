import type { IncarnonSelection } from '../../types/incarnon';
import type {
  BuildConfig,
  BuildVisibility,
  Companion,
  EquipmentType,
  ModSlot,
  ValenceBonus,
  Warframe,
  Weapon,
} from '../../types/warframe';
import type { ArcaneSlot } from './ArcaneSlots';
import type { ShardSlotConfig } from './ArchonShardSlots';

export type Equipment = Warframe | Weapon | Companion;

export function getAbilityName(warframe: Warframe | null, index: number): string {
  if (!warframe?.abilities) return `Ability ${index + 1}`;
  try {
    const parsed = JSON.parse(warframe.abilities) as Array<{
      abilityName?: string;
      name?: string;
    }>;
    const ab = parsed[index];
    return ab?.abilityName || ab?.name || `Ability ${index + 1}`;
  } catch {
    return `Ability ${index + 1}`;
  }
}

export function getEquipmentListUrl(type: EquipmentType): string {
  switch (type) {
    case 'warframe':
      return '/api/warframes';
    case 'primary':
      return '/api/weapons?type=LongGuns';
    case 'secondary':
      return '/api/weapons?type=Pistols';
    case 'melee':
      return '/api/weapons?type=Melee';
    case 'archgun':
      return '/api/weapons?type=SpaceGuns';
    case 'archmelee':
      return '/api/weapons?type=SpaceMelee';
    case 'companion':
      return '/api/companions';
    case 'beast_claws':
      return '/api/weapons?type=SentinelWeapons';
    case 'archwing':
      return '/api/warframes';
    case 'necramech':
      return '/api/warframes';
    default:
      return '/api/warframes';
  }
}

export function getSetName(slot: ModSlot): string | undefined {
  if (!slot.mod?.mod_set || !slot.mod.set_stats) return undefined;
  return slot.mod.mod_set;
}

export function clampSetRank(slot: ModSlot, rank: number): number {
  const maxSetRank = slot.mod?.set_num_in_set ?? 1;
  return Math.max(1, Math.min(maxSetRank, rank));
}

export function applySetPieceDelta(prevSlots: ModSlot[], nextSlots: ModSlot[]): ModSlot[] {
  const prevCounts = new Map<string, number>();
  const prevRanks = new Map<string, number>();

  for (const slot of prevSlots) {
    const setName = getSetName(slot);
    if (!setName) continue;
    prevCounts.set(setName, (prevCounts.get(setName) ?? 0) + 1);
    if (!prevRanks.has(setName)) {
      prevRanks.set(setName, slot.setRank ?? 1);
    }
  }

  const nextCounts = new Map<string, number>();
  let updated = nextSlots.map((slot) => {
    const setName = getSetName(slot);
    if (!setName) return slot;
    nextCounts.set(setName, (nextCounts.get(setName) ?? 0) + 1);
    return slot.setRank == null ? { ...slot, setRank: 1 } : slot;
  });

  for (const [setName, nextCount] of nextCounts) {
    const prevCount = prevCounts.get(setName) ?? 0;
    if (prevCount === 0) continue;
    const delta = nextCount - prevCount;
    if (delta === 0) continue;

    const baseRank = prevRanks.get(setName) ?? 1;
    const targetRank = baseRank + delta;
    updated = updated.map((slot) => {
      if (getSetName(slot) !== setName) return slot;
      const nextRank = clampSetRank(slot, targetRank);
      return slot.setRank === nextRank ? slot : { ...slot, setRank: nextRank };
    });
  }

  return updated;
}

export function applySetRankDelta(
  slots: ModSlot[],
  setName: string,
  delta: number,
  fallbackRank: number,
): ModSlot[] {
  return slots.map((slot) => {
    if (getSetName(slot) !== setName) return slot;
    const currentRank = slot.setRank ?? fallbackRank;
    const nextRank = clampSetRank(slot, currentRank + delta);
    return slot.setRank === nextRank ? slot : { ...slot, setRank: nextRank };
  });
}

export function modBuilderPersistFingerprint(args: {
  buildName: string;
  buildDescription: string;
  buildVisibility: BuildVisibility;
  equipmentType: EquipmentType;
  equipmentUniqueName: string;
  currentBuildId?: string;
  slots: ModSlot[];
  helminthConfig: BuildConfig['helminth'] | undefined;
  incarnonEnabled: boolean;
  incarnonSelections: IncarnonSelection[] | undefined;
  arcaneSlots: ArcaneSlot[];
  shardSlots: ShardSlotConfig[];
  orokinReactor: boolean;
  valenceBonus: ValenceBonus | null;
}): string {
  return JSON.stringify({
    n: args.buildName,
    d: args.buildDescription,
    p: args.buildVisibility,
    et: args.equipmentType,
    eu: args.equipmentUniqueName,
    id: args.currentBuildId ?? '',
    s: args.slots,
    h: args.helminthConfig,
    ie: args.incarnonEnabled,
    is: args.incarnonSelections,
    a: args.arcaneSlots,
    sh: args.shardSlots,
    o: args.orokinReactor,
    v: args.valenceBonus,
  });
}

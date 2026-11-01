import { artifactIdentityKey, identityFromArtifact } from './artifactDuplicate.ts';
import { artifactBaseStatRange, ARTIFACT_SECONDARY_STATS, GEAR_SLOTS } from './catalog.ts';
import { gearIdentityKey, identityFromGearRow, type GearIdentitySource } from './gearDuplicate.ts';
import { parseArtifactBody, parseGearBody, type ArtifactBody, type GearBody } from './schemas.ts';
import { ALL_SETS } from './sets.ts';

// Game suit id to Outfitter set name. Unknown ids stay rejected.
const SUIT_NAMES: Record<number, string> = {
  710800: 'Annihilating Might',
  710900: 'Whirlwind',
  711000: 'Calamity',
  711100: 'Life Force',
  711200: 'Salvation',
  711300: 'Warlord',
  711400: 'Immortal Warrior',
  711500: 'Wicked Vengeance',
  711600: "Light's Grace",
  711800: 'Astral Guardian',
  711900: 'Drakefire',
  712000: 'Goldmane',
  720300: 'Guardian',
  720500: 'Curse',
  720600: 'Fracture',
  721000: 'The Glacier',
  721100: 'Night Terror',
  721300: 'The Doom',
  721400: 'The Wisdom',
  721500: 'The Insight',
  721600: 'Asclepius',
  721900: 'Ageless Wrath',
  722000: 'Invigoration',
  722100: 'Morale',
  722200: 'Unshaken Will',
  722300: 'Soulbound Arcana',
  722400: 'Infernal Roar',
  722500: "Hell's Lament",
  722600: 'Tempered Will',
  722800: 'Cataclysm',
  722900: 'Wings of Grace',
  723000: 'Greyfang',
  723100: 'Undying Savage',
};

const HERO_BY_ID: Record<number, string> = {
  2004: 'salazar',
  2009: 'wrath',
  2018: 'nocturne',
  2019: 'ajax',
  2021: 'king-harz',
  2023: 'dolores',
  2034: 'hatssut',
  2042: 'shamir',
  2048: 'zilitu',
  2054: 'calypso',
  2058: 'torodor',
  2066: 'constance',
  2085: 'valkyra',
  2134: 'volka',
  2136: 'solcadens',
  2146: 'abomination',
  2153: 'aracha',
  2171: 'laya',
  2180: 'silas',
  2181: 'setram',
  2183: 'uredin',
  2188: 'vierna',
  2189: 'ezryn',
  2197: 'gwendolyn',
  2198: 'twinfiend',
  2205: 'hex',
  2212: 'boreas',
  2217: 'zelus',
  2219: 'magmus',
  2236: 'rygar',
  2242: 'beelzebub',
  2243: 'razaak',
  2244: 'alaura',
  2250: 'beatrix',
  2251: 'anai',
  2253: 'iovar',
  2256: 'xena',
  2259: 'lord-phineas',
  2274: 'Calista',
  2275: 'talin',
  2317: 'draelyn',
};

const FACTION_BY_CODE: Record<number, string> = {
  103: 'nightmare_council',
  104: 'cursed_cult',
  105: 'infernal_blast',
  106: 'star_piercers',
  107: 'esoteria_order',
  108: 'chaos_dominion',
  109: 'supreme_arbiters',
  1101: 'watchguard',
  1102: 'north_throne',
  1104: 'cursed_cult',
};

const SET_BY_NAME = new Map(ALL_SETS.map((set) => [set.name.toLowerCase(), set]));
const SECONDARY = new Set<string>(ARTIFACT_SECONDARY_STATS);

export type ImportMode = 'restore' | 'sync' | 'skip';

export type ImportOptions = {
  gearMode: ImportMode;
  artifactMode: ImportMode;
  plus16Only: boolean;
};

export type StashGear = GearIdentitySource & { id: number; game_uid: string | null };
export type StashArtifact = {
  id: number;
  game_uid: string | null;
  catalog_slug: string;
  level: number;
  promotion: number;
  hp_base: number;
  hp_bonus: number;
  atk_base: number;
  atk_bonus: number;
  secondary_stat: string | null;
  secondary_value: number | null;
};

export type CatalogArtifactRef = {
  slug: string;
  name: string;
  rarity: string;
  star_rating: number;
};

export type PlannedGear = {
  game_uid: string;
  label: string;
  match_id: number | null;
  write: GearBody['write'];
};

export type PlannedArtifact = {
  game_uid: string;
  label: string;
  match_id: number | null;
  write: ArtifactBody;
};

export type ImportReject = { uid: string; reason: string };
export type ImportMissing = { id: number; label: string };
export type ImportLink = { id: number; game_uid: string };

export type ImportBucket<T> = {
  add: T[];
  update: T[];
  links: ImportLink[];
  unchanged: number;
  rejected: ImportReject[];
  missing: ImportMissing[];
  wipe_count: number;
};

export type ImportPlan = {
  gear: ImportBucket<PlannedGear>;
  artifacts: ImportBucket<PlannedArtifact>;
  unknown_hero_ids: number[];
  skipped_below_16: number;
  warnings: string[];
};

const EMPTY = <T>(): ImportBucket<T> => ({
  add: [],
  update: [],
  links: [],
  unchanged: 0,
  rejected: [],
  missing: [],
  wipe_count: 0,
});

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function uidOf(raw: Record<string, unknown>): string | null {
  const uid = raw.uid;
  if (typeof uid === 'number' && Number.isFinite(uid)) return String(uid);
  if (typeof uid === 'string' && uid.trim()) return uid.trim();
  return null;
}

function fileIsNumeric(gear: unknown[]): boolean {
  return gear.some((piece) => {
    const raw = record(piece);
    if (!raw) return false;
    if (Array.isArray(raw.main_stats)) return true;
    if (typeof raw.slot === 'number') return true;
    return (
      Array.isArray(raw.stats) &&
      raw.stats.some((stat) => {
        const row = record(stat);
        return row != null && 'id' in row;
      })
    );
  });
}

function namedStats(value: unknown): { stat: string; value: number }[] | null {
  if (!Array.isArray(value)) return null;
  const stats: { stat: string; value: number }[] = [];
  for (const entry of value) {
    const row = record(entry);
    if (!row || typeof row.stat !== 'string' || typeof row.value !== 'number') return null;
    stats.push({ stat: row.stat, value: row.value });
  }
  return stats;
}

function gearPrefix(raw: Record<string, unknown>): 'none' | 'ancient' | 'variant' {
  // quality 6 is a normal piece, 8 is ancient, 12 and 13 carry a mutation line.
  if (raw.quality === 8) return 'ancient';
  if (raw.quality === 12 || raw.quality === 13) return 'variant';
  return 'none';
}

function exclusiveFor(
  raw: Record<string, unknown>,
  slot: string,
): {
  hero: string | null;
  faction: string | null;
} {
  const itemId = raw.item_id;
  if (typeof itemId !== 'number') return { hero: null, faction: null };
  if (slot === 'ring') {
    return { hero: null, faction: FACTION_BY_CODE[Math.trunc(itemId / 1000)] ?? null };
  }
  const body = Math.trunc(itemId / 100);
  const heroId = HERO_BY_ID[body] ? body : body % 10000;
  return { hero: HERO_BY_ID[heroId] ?? null, faction: null };
}

function suitName(raw: Record<string, unknown>): string | null {
  if (typeof raw.suit_name === 'string' && raw.suit_name.trim()) return raw.suit_name.trim();
  if (typeof raw.suit_id === 'number') return SUIT_NAMES[raw.suit_id] ?? null;
  return null;
}

type ReadyGear = { uid: string; label: string; hero_id: number | null; write: GearBody['write'] };

function prepareGear(
  raw: Record<string, unknown>,
  uid: string,
): { ready: ReadyGear } | { reason: string } {
  const subs = namedStats(raw.sub_stats);
  if (typeof raw.main_stat !== 'string' || !subs || subs.length !== 4) {
    return { reason: 'Missing a main stat or four subs.' };
  }
  const slot = raw.slot;
  if (typeof slot !== 'string' || !(GEAR_SLOTS as readonly string[]).includes(slot)) {
    return { reason: 'Unknown slot.' };
  }
  const name = suitName(raw);
  const set = name ? SET_BY_NAME.get(name.toLowerCase()) : undefined;
  if (!set) return { reason: name ? `Unknown set ${name}.` : 'Unknown set.' };
  const exclusive = exclusiveFor(raw, slot);
  const parsed = parseGearBody({
    slot,
    set_key: set.key,
    prefix: gearPrefix(raw),
    main_stat: raw.main_stat,
    main_value: raw.main_value,
    main_bonus: raw.main_bonus ?? 0,
    substats: subs,
    exclusive_hero_slug: exclusive.hero,
    exclusive_faction: exclusive.faction,
    equipped_hero_slug: null,
  });
  if (typeof parsed === 'string') return { reason: parsed };
  const hero = raw.hero_id;
  return {
    ready: {
      uid,
      label: `${set.name} ${slot}`,
      hero_id: typeof hero === 'number' && hero ? hero : null,
      write: parsed.write,
    },
  };
}

function claimGear(
  stash: StashGear[],
  used: Set<number>,
  uid: string,
  key: string,
): StashGear | undefined {
  const byUid = stash.find((row) => !used.has(row.id) && row.game_uid === uid);
  if (byUid) return byUid;
  return stash.find(
    (row) =>
      !used.has(row.id) && !row.game_uid && gearIdentityKey(identityFromGearRow(row)) === key,
  );
}

function planGear(
  pieces: unknown[],
  stash: StashGear[],
  options: ImportOptions,
): { bucket: ImportBucket<PlannedGear>; heroes: number[]; skipped: number } {
  const bucket = EMPTY<PlannedGear>();
  const heroes: number[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  const ready: ReadyGear[] = [];

  for (const piece of pieces) {
    const raw = record(piece);
    const uid = raw ? uidOf(raw) : null;
    if (!raw || !uid) {
      bucket.rejected.push({ uid: uid ?? '?', reason: 'Missing gear uid.' });
      continue;
    }
    if (seen.has(uid)) {
      bucket.rejected.push({ uid, reason: 'Duplicate gear uid.' });
      continue;
    }
    seen.add(uid);
    if (options.plus16Only && raw.level !== 16) {
      skipped += 1;
      continue;
    }
    const prepared = prepareGear(raw, uid);
    if ('reason' in prepared) {
      bucket.rejected.push({ uid, reason: prepared.reason });
      continue;
    }
    ready.push(prepared.ready);
    if (prepared.ready.hero_id) heroes.push(prepared.ready.hero_id);
  }

  if (options.gearMode === 'skip') return { bucket, heroes: [], skipped };

  if (options.gearMode === 'restore') {
    bucket.wipe_count = stash.length;
    bucket.add = ready.map((piece) => ({
      game_uid: piece.uid,
      label: piece.label,
      match_id: null,
      write: piece.write,
    }));
    return { bucket, heroes, skipped };
  }

  const used = new Set<number>();
  for (const piece of ready) {
    const key = gearIdentityKey(identityFromGearRow(piece.write));
    const match = claimGear(stash, used, piece.uid, key);
    if (!match) {
      bucket.add.push({
        game_uid: piece.uid,
        label: piece.label,
        match_id: null,
        write: piece.write,
      });
      continue;
    }
    used.add(match.id);
    const same = gearIdentityKey(identityFromGearRow(match)) === key;
    if (same) {
      bucket.unchanged += 1;
      if (!match.game_uid) bucket.links.push({ id: match.id, game_uid: piece.uid });
      continue;
    }
    bucket.update.push({
      game_uid: piece.uid,
      label: piece.label,
      match_id: match.id,
      write: piece.write,
    });
  }

  if (!options.plus16Only) {
    for (const row of stash) {
      if (used.has(row.id)) continue;
      bucket.missing.push({ id: row.id, label: `${row.set_key} ${row.slot}` });
    }
  }
  return { bucket, heroes, skipped };
}

type ReadyArtifact = {
  uid: string;
  label: string;
  hero_id: number | null;
  basesKnown: boolean;
  write: ArtifactBody;
};

function bonus(stats: { stat: string; value: number }[] | null, stat: string): number {
  return stats?.find((entry) => entry.stat === stat)?.value ?? 0;
}

function prepareArtifact(
  raw: Record<string, unknown>,
  uid: string,
  catalog: CatalogArtifactRef[],
): { ready: ReadyArtifact } | { reason: string } {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const found = catalog.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!found) return { reason: name ? `Unknown artifact ${name}.` : 'Missing artifact name.' };
  const refine = namedStats(raw.refine_stats) ?? [];
  const dark = namedStats(raw.dark_stats) ?? [];
  if (raw.refine_stats != null && !namedStats(raw.refine_stats))
    return { reason: 'Unreadable refine stats.' };
  if (raw.dark_stats != null && !namedStats(raw.dark_stats))
    return { reason: 'Unreadable bonus stat.' };
  const secondary = dark.find((entry) => SECONDARY.has(entry.stat));
  const level = raw.level;
  const promotion = raw.stage;
  const basesKnown = level === 25 && promotion === 5;
  const range = artifactBaseStatRange(found.rarity, found.star_rating);
  const parsed = parseArtifactBody(
    {
      catalog_slug: found.slug,
      level,
      promotion,
      hp_base: basesKnown ? range.hp.max : 0,
      hp_bonus: bonus(refine, 'hp'),
      atk_base: basesKnown ? range.atk.max : 0,
      atk_bonus: bonus(refine, 'atk'),
      secondary_stat: secondary?.stat ?? null,
      secondary_value: secondary?.value ?? null,
    },
    new Set(catalog.map((entry) => entry.slug)),
  );
  if (typeof parsed === 'string') return { reason: parsed };
  const hero = raw.hero_id;
  return {
    ready: {
      uid,
      label: found.name,
      hero_id: typeof hero === 'number' && hero ? hero : null,
      basesKnown,
      write: parsed,
    },
  };
}

function claimArtifact(
  stash: StashArtifact[],
  used: Set<number>,
  uid: string,
  write: ArtifactBody,
  basesKnown: boolean,
): StashArtifact | undefined {
  const byUid = stash.find((row) => !used.has(row.id) && row.game_uid === uid);
  if (byUid) return byUid;
  return stash.find((row) => {
    if (used.has(row.id) || row.game_uid) return false;
    const candidate = basesKnown
      ? write
      : { ...write, hp_base: row.hp_base, atk_base: row.atk_base };
    return (
      artifactIdentityKey(identityFromArtifact(candidate)) ===
      artifactIdentityKey(identityFromArtifact(row))
    );
  });
}

function planArtifacts(
  pieces: unknown[],
  stash: StashArtifact[],
  catalog: CatalogArtifactRef[],
  mode: ImportMode,
): { bucket: ImportBucket<PlannedArtifact>; heroes: number[]; unknownBases: number } {
  const bucket = EMPTY<PlannedArtifact>();
  const heroes: number[] = [];
  let unknownBases = 0;
  const seen = new Set<string>();
  const ready: ReadyArtifact[] = [];

  for (const piece of pieces) {
    const raw = record(piece);
    const uid = raw ? uidOf(raw) : null;
    if (!raw || !uid) {
      bucket.rejected.push({ uid: uid ?? '?', reason: 'Missing artifact uid.' });
      continue;
    }
    if (seen.has(uid)) {
      bucket.rejected.push({ uid, reason: 'Duplicate artifact uid.' });
      continue;
    }
    seen.add(uid);
    const prepared = prepareArtifact(raw, uid, catalog);
    if ('reason' in prepared) {
      bucket.rejected.push({ uid, reason: prepared.reason });
      continue;
    }
    ready.push(prepared.ready);
    if (!prepared.ready.basesKnown) unknownBases += 1;
    if (prepared.ready.hero_id) heroes.push(prepared.ready.hero_id);
  }

  if (mode === 'skip') return { bucket, heroes: [], unknownBases };

  if (mode === 'restore') {
    bucket.wipe_count = stash.length;
    bucket.add = ready.map((piece) => ({
      game_uid: piece.uid,
      label: piece.label,
      match_id: null,
      write: piece.write,
    }));
    return { bucket, heroes, unknownBases };
  }

  const used = new Set<number>();
  for (const piece of ready) {
    const match = claimArtifact(stash, used, piece.uid, piece.write, piece.basesKnown);
    const write = { ...piece.write };
    if (match && !piece.basesKnown) {
      write.hp_base = match.hp_base;
      write.atk_base = match.atk_base;
    }
    if (!match) {
      bucket.add.push({ game_uid: piece.uid, label: piece.label, match_id: null, write });
      continue;
    }
    used.add(match.id);
    const same =
      artifactIdentityKey(identityFromArtifact(write)) ===
      artifactIdentityKey(identityFromArtifact(match));
    if (same) {
      bucket.unchanged += 1;
      if (!match.game_uid) bucket.links.push({ id: match.id, game_uid: piece.uid });
      continue;
    }
    bucket.update.push({ game_uid: piece.uid, label: piece.label, match_id: match.id, write });
  }

  for (const row of stash) {
    if (used.has(row.id)) continue;
    bucket.missing.push({ id: row.id, label: row.catalog_slug });
  }
  return { bucket, heroes, unknownBases };
}

export function planWorImport(
  file: unknown,
  stashGearRows: StashGear[],
  stashArtifactRows: StashArtifact[],
  catalog: CatalogArtifactRef[],
  options: ImportOptions,
): { error: string } | { plan: ImportPlan } {
  const root = record(file);
  if (!root || !Array.isArray(root.gear)) return { error: 'This file has no gear list.' };
  if (fileIsNumeric(root.gear)) {
    return { error: 'This file still uses numeric stat ids. Run the extractor again.' };
  }
  const artifacts = Array.isArray(root.artifacts) ? root.artifacts : [];
  const gear = planGear(root.gear, stashGearRows, options);
  const arts = planArtifacts(artifacts, stashArtifactRows, catalog, options.artifactMode);
  const warnings: string[] = [];
  const incomplete = gear.bucket.rejected.filter((row) => row.reason.startsWith('Missing a main'));
  if (incomplete.length) {
    warnings.push(`${incomplete.length} gear pieces are missing a main stat or four subs.`);
  }
  if (gear.skipped) warnings.push(`${gear.skipped} gear pieces are below +16 and were left out.`);
  if (options.gearMode === 'restore') {
    const unread = gear.bucket.rejected.length
      ? ` ${gear.bucket.rejected.length} pieces in the file cannot be imported.`
      : '';
    warnings.push(
      `Restore deletes all ${gear.bucket.wipe_count} stored gear pieces first.${unread}`,
    );
  }
  if (options.artifactMode === 'restore') {
    const unread = arts.bucket.rejected.length
      ? ` ${arts.bucket.rejected.length} artifacts in the file cannot be imported.`
      : '';
    warnings.push(`Restore deletes all ${arts.bucket.wipe_count} stored artifacts first.${unread}`);
  }
  if (arts.unknownBases && options.artifactMode !== 'skip') {
    warnings.push(
      `${arts.unknownBases} artifacts are below +25 stage 5, so their white HP and ATK were saved as 0.`,
    );
  }
  const unknown = [...new Set([...gear.heroes, ...arts.heroes])].sort((a, b) => a - b);
  if (unknown.length) {
    warnings.push(
      `${unknown.length} game heroes have no Outfitter name, so their pieces stay unequipped.`,
    );
  }
  if (options.plus16Only) {
    gear.bucket.missing = [];
    arts.bucket.missing = [];
  }
  return {
    plan: {
      gear: gear.bucket,
      artifacts: arts.bucket,
      unknown_hero_ids: unknown,
      skipped_below_16: gear.skipped,
      warnings,
    },
  };
}

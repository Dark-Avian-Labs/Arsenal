import { GEAR_SLOTS, type GearSlot } from './catalog.ts';
import {
  attacksPerSecond,
  BASE_CRIT_DMG,
  computeFinalStats,
  healingMultiplier,
  scaledStat,
  type FinalStats,
  type HeroBaseStats,
  type StatBag,
} from './formulas.ts';
import { loadoutStatBag, pieceStatBag, type GearPieceInput } from './pieceStats.ts';
import { SET_BY_KEY, type SetStatBonus } from './sets.ts';

export const SCORE_STAT_KEYS = [
  'atk',
  'hp',
  'def',
  'critRate',
  'critDmg',
  'atkSpd',
  'healingEffect',
  'rageRegen',
  'rageRegenAuto',
  'damageTaken',
  'aoeDamage',
  'stDamage',
  'basicAtkDamage',
  'damageAfterCrit',
  'damageAfterUlt',
  'critDmgAfterUlt',
] as const;
export type ScoreStatKey = (typeof SCORE_STAT_KEYS)[number];

export type OutfitRoleId = 'damage' | 'tank' | 'support';

export type OutfitRole = {
  id: OutfitRoleId;
  label: string;
  classKey: 'fighter' | 'defender' | 'healer';
  weights: Partial<Record<ScoreStatKey, number>>;
  minimums: Partial<Record<ScoreStatKey, number>>;
};

export const OUTFIT_ROLES: readonly OutfitRole[] = [
  {
    id: 'damage',
    label: 'Damage',
    classKey: 'fighter',
    weights: { atk: 10, critRate: 8, critDmg: 8, atkSpd: 5 },
    minimums: { critRate: 100 },
  },
  {
    id: 'tank',
    label: 'Tank',
    classKey: 'defender',
    weights: { hp: 10, def: 3 },
    minimums: {},
  },
  {
    id: 'support',
    label: 'Support',
    classKey: 'healer',
    weights: { atkSpd: 10, rageRegen: 8, healingEffect: 8, atk: 5, hp: 5 },
    minimums: {},
  },
];

export const SCORE_STAT_LABELS: Record<ScoreStatKey, string> = {
  atk: 'ATK',
  hp: 'HP',
  def: 'DEF',
  critRate: 'Crit Rate',
  critDmg: 'Crit Damage',
  atkSpd: 'ATK Speed',
  healingEffect: 'Healing Effect',
  rageRegen: 'Rage Regen %',
  rageRegenAuto: 'Rage Regen (Auto)',
  damageTaken: 'Damage Taken reduction',
  aoeDamage: 'AoE Damage',
  stDamage: 'Single-target Damage',
  basicAtkDamage: 'Basic ATK Damage',
  damageAfterCrit: 'Damage after crit',
  damageAfterUlt: 'Damage after ult',
  critDmgAfterUlt: 'Crit Damage after ult',
};

export type OptimizerRequest = {
  hero: HeroBaseStats;
  pieces: GearPieceInput[];
  weights: Partial<Record<ScoreStatKey, number>>;
  minimums: Partial<Record<ScoreStatKey, number>>;
  desiredLeftSet?: string | null;
  desiredRightSet?: string | null;
  forceSets: boolean;
  /** Equipped pieces on this slug stay in the pool. */
  includeEquippedHeroSlug?: string | null;
  /** Equipped pieces on every hero except `heroSlug` stay in the pool. */
  includeOthersEquipped?: boolean;
  /** Hero being built. Keeps "others" from also pulling this hero when their own toggle is off. */
  heroSlug?: string | null;
};

export type RankedLoadout = {
  score: number;
  pieces: GearPieceInput[];
  stats: FinalStats;
};

// Branch-and-bound prunes dead subtrees; keep a generous cap for massive inventories.
const FULL_ENUM_LIMIT = 20_000_000;
const SCORE_KEEP = 28;
const MIN_KEEP = 16;
const SET_KEEP = 6;
const DESIRED_SET_KEEP = 20;
const RESULT_COUNT = 3;
const CRIT_RATE_SCORE_CAP = 100;
const SEARCH_YIELD_EVERY = 50_000;
const GLACIER_HP_RATIO = 0.06;
const EPS = 1e-9;

export type OptimizerProgress = (done: number, total: number) => void;

function bySlot(pieces: GearPieceInput[]): Record<GearSlot, GearPieceInput[]> {
  const grouped: Record<GearSlot, GearPieceInput[]> = {
    weapon: [],
    armor: [],
    bangle: [],
    amulet: [],
    ring: [],
  };
  for (const piece of pieces) {
    grouped[piece.slot].push(piece);
  }
  return grouped;
}

function filterInventory(request: OptimizerRequest): GearPieceInput[] {
  return request.pieces.filter((piece) => {
    if (piece.equippedHeroSlug) {
      const onThisHero =
        request.includeEquippedHeroSlug != null &&
        piece.equippedHeroSlug === request.includeEquippedHeroSlug;
      const onAnotherHero =
        request.includeOthersEquipped === true && piece.equippedHeroSlug !== request.heroSlug;
      if (!onThisHero && !onAnotherHero) return false;
    }
    if (request.forceSets) {
      const isLeft = piece.slot === 'weapon' || piece.slot === 'armor';
      if (isLeft && request.desiredLeftSet && piece.setKey !== request.desiredLeftSet) return false;
      if (!isLeft && request.desiredRightSet && piece.setKey !== request.desiredRightSet) {
        return false;
      }
    }
    return true;
  });
}

function baseShare(value: number, base: number): number {
  if (!(base > 0)) return 0;
  return value / base;
}

function scoreValue(stat: ScoreStatKey, stats: FinalStats, hero: HeroBaseStats): number {
  switch (stat) {
    case 'atk':
      return baseShare(stats.atk, hero.atk);
    case 'hp':
      return baseShare(stats.hp, hero.hp);
    case 'def':
      return baseShare(stats.def, hero.def);
    case 'critRate':
      return Math.min(stats.critRate, CRIT_RATE_SCORE_CAP) / 100;
    case 'critDmg':
      return stats.critDmg / BASE_CRIT_DMG;
    case 'atkSpd': {
      const baseAps = attacksPerSecond(hero.atkInterval, 100);
      const aps = attacksPerSecond(hero.atkInterval, stats.atkSpd);
      if (baseAps <= 0) return 0;
      return aps / baseAps - 1;
    }
    case 'healingEffect':
      return stats.healMultiplier - 1;
    case 'rageRegen':
      return stats.rageRegen / 100;
    case 'rageRegenAuto':
      return stats.rageRegenAuto / 100;
    case 'damageTaken':
      return -stats.damageTaken / 100;
    case 'aoeDamage':
      return stats.aoeDamage / 100;
    case 'stDamage':
      return stats.stDamage / 100;
    case 'basicAtkDamage':
      return stats.basicAtkDamage / 100;
    case 'damageAfterCrit':
      return stats.damageAfterCrit / 100;
    case 'damageAfterUlt':
      return stats.damageAfterUlt / 100;
    case 'critDmgAfterUlt':
      return stats.critDmgAfterUlt / 100;
    default: {
      const _exhaustive: never = stat;
      return _exhaustive;
    }
  }
}

function rawForMinimum(stat: ScoreStatKey, stats: FinalStats): number {
  switch (stat) {
    case 'atk':
      return stats.atk;
    case 'hp':
      return stats.hp;
    case 'def':
      return stats.def;
    case 'critRate':
      return stats.critRate;
    case 'critDmg':
      return stats.critDmg;
    case 'atkSpd':
      return stats.atkSpd;
    case 'healingEffect':
      return stats.healingEffect;
    case 'rageRegen':
      return stats.rageRegen;
    case 'rageRegenAuto':
      return stats.rageRegenAuto;
    case 'damageTaken':
      return -stats.damageTaken;
    case 'aoeDamage':
      return stats.aoeDamage;
    case 'stDamage':
      return stats.stDamage;
    case 'basicAtkDamage':
      return stats.basicAtkDamage;
    case 'damageAfterCrit':
      return stats.damageAfterCrit;
    case 'damageAfterUlt':
      return stats.damageAfterUlt;
    case 'critDmgAfterUlt':
      return stats.critDmgAfterUlt;
    default: {
      const _exhaustive: never = stat;
      return _exhaustive;
    }
  }
}

function comboCount(grouped: Record<GearSlot, GearPieceInput[]>): number {
  return GEAR_SLOTS.reduce((product, slot) => product * Math.max(grouped[slot].length, 0), 1);
}

function activeMinimumKeys(request: OptimizerRequest): ScoreStatKey[] {
  const keys: ScoreStatKey[] = [];
  for (const key of SCORE_STAT_KEYS) {
    const minimum = request.minimums[key];
    if (minimum == null || Number.isNaN(minimum)) continue;
    keys.push(key);
  }
  return keys;
}

function desiredSetForSlot(slot: GearSlot, request: OptimizerRequest): string | null {
  if (slot === 'weapon' || slot === 'armor') {
    return request.desiredLeftSet || null;
  }
  return request.desiredRightSet || null;
}

function soloStats(piece: GearPieceInput, hero: OptimizerRequest['hero']): FinalStats {
  return computeFinalStats(hero, loadoutStatBag([piece]));
}

function pieceWeightHint(piece: GearPieceInput, request: OptimizerRequest): number {
  const stats = soloStats(piece, request.hero);
  let score = 0;
  for (const key of SCORE_STAT_KEYS) {
    const weight = request.weights[key] ?? 0;
    if (weight <= 0) continue;
    score += weight * scoreValue(key, stats, request.hero);
  }
  for (const key of activeMinimumKeys(request)) {
    score += rawForMinimum(key, stats) * 0.01;
  }
  return score;
}

function takeTop(
  pieces: GearPieceInput[],
  limit: number,
  scoreOf: (piece: GearPieceInput) => number,
): GearPieceInput[] {
  if (pieces.length <= limit) return pieces;
  return [...pieces]
    .sort((left, right) => {
      const delta = scoreOf(right) - scoreOf(left);
      if (delta !== 0) return delta;
      return left.id - right.id;
    })
    .slice(0, limit);
}

function unionById(groups: GearPieceInput[][]): GearPieceInput[] {
  const seen = new Set<number>();
  const merged: GearPieceInput[] = [];
  for (const group of groups) {
    for (const piece of group) {
      if (seen.has(piece.id)) continue;
      seen.add(piece.id);
      merged.push(piece);
    }
  }
  return merged;
}

function reservedIdsForSlot(
  pieces: GearPieceInput[],
  slot: GearSlot,
  request: OptimizerRequest,
  hintOf: (piece: GearPieceInput) => number,
): Set<number> {
  const groups: GearPieceInput[][] = [];
  groups.push(takeTop(pieces, 1, hintOf));
  for (const key of activeMinimumKeys(request)) {
    groups.push(takeTop(pieces, 1, (piece) => rawForMinimum(key, soloStats(piece, request.hero))));
  }
  const desired = desiredSetForSlot(slot, request);
  if (desired) {
    groups.push(
      takeTop(
        pieces.filter((piece) => piece.setKey === desired),
        1,
        hintOf,
      ),
    );
  }
  return new Set(unionById(groups).map((piece) => piece.id));
}

function keepForSlot(
  pieces: GearPieceInput[],
  slot: GearSlot,
  request: OptimizerRequest,
  hintOf: (piece: GearPieceInput) => number,
): GearPieceInput[] {
  const groups: GearPieceInput[][] = [takeTop(pieces, SCORE_KEEP, hintOf)];
  for (const key of activeMinimumKeys(request)) {
    groups.push(
      takeTop(pieces, MIN_KEEP, (piece) => rawForMinimum(key, soloStats(piece, request.hero))),
    );
  }
  const desired = desiredSetForSlot(slot, request);
  if (desired) {
    groups.push(
      takeTop(
        pieces.filter((piece) => piece.setKey === desired),
        DESIRED_SET_KEEP,
        hintOf,
      ),
    );
  }
  const bySet = new Map<string, GearPieceInput[]>();
  for (const piece of pieces) {
    const bucket = bySet.get(piece.setKey);
    if (bucket) bucket.push(piece);
    else bySet.set(piece.setKey, [piece]);
  }
  for (const setPieces of bySet.values()) {
    groups.push(takeTop(setPieces, SET_KEEP, hintOf));
  }
  return unionById(groups);
}

function dropWorstExtra(
  grouped: Record<GearSlot, GearPieceInput[]>,
  reserved: Record<GearSlot, Set<number>>,
  hintOf: (piece: GearPieceInput) => number,
): boolean {
  let worstSlot: GearSlot | null = null;
  let worstId = -1;
  let worstScore = Number.POSITIVE_INFINITY;
  let largestCount = 0;
  for (const slot of GEAR_SLOTS) {
    const pieces = grouped[slot];
    if (pieces.length <= 1) continue;
    for (const piece of pieces) {
      if (reserved[slot].has(piece.id)) continue;
      const score = hintOf(piece);
      if (
        pieces.length > largestCount ||
        (pieces.length === largestCount && score < worstScore) ||
        (pieces.length === largestCount && score === worstScore && piece.id > worstId)
      ) {
        largestCount = pieces.length;
        worstScore = score;
        worstSlot = slot;
        worstId = piece.id;
      }
    }
  }
  if (worstSlot == null) return false;
  grouped[worstSlot] = grouped[worstSlot].filter((piece) => piece.id !== worstId);
  return true;
}

function pruneSlots(
  grouped: Record<GearSlot, GearPieceInput[]>,
  request: OptimizerRequest,
): Record<GearSlot, GearPieceInput[]> {
  const next: Record<GearSlot, GearPieceInput[]> = {
    weapon: [],
    armor: [],
    bangle: [],
    amulet: [],
    ring: [],
  };
  const reserved: Record<GearSlot, Set<number>> = {
    weapon: new Set(),
    armor: new Set(),
    bangle: new Set(),
    amulet: new Set(),
    ring: new Set(),
  };
  const hints = new Map<number, number>();
  for (const slot of GEAR_SLOTS) {
    for (const piece of grouped[slot]) hints.set(piece.id, pieceWeightHint(piece, request));
  }
  const hintOf = (piece: GearPieceInput) => hints.get(piece.id) ?? 0;
  for (const slot of GEAR_SLOTS) {
    next[slot] = keepForSlot(grouped[slot], slot, request, hintOf);
    reserved[slot] = reservedIdsForSlot(grouped[slot], slot, request, hintOf);
  }
  while (comboCount(next) > FULL_ENUM_LIMIT) {
    if (dropWorstExtra(next, reserved, hintOf)) continue;
    break;
  }
  return next;
}

// Flat packed representation of one slot's pieces for allocation-free Branch-and-Bound.
type PackedSlot = {
  pieces: GearPieceInput[];
  count: number;
  setIdx: Int32Array;
  flatHp: Float64Array;
  flatAtk: Float64Array;
  flatDef: Float64Array;
  hpPct: Float64Array;
  atkPct: Float64Array;
  defPct: Float64Array;
  atkSpd: Float64Array;
  critRate: Float64Array;
  critDmg: Float64Array;
  healingEffect: Float64Array;
  rageRegen: Float64Array;
};

type SetBonusVec = {
  hpPct: number;
  atkPct: number;
  defPct: number;
  atkSpd: number;
  critRate: number;
  critDmg: number;
  healingEffect: number;
  rageRegen: number;
  rageRegenAuto: number;
  damageTakenNeg: number; // stored as positive (-damageTaken)
  aoeDamage: number;
  stDamage: number;
  basicAtkDamage: number;
  damageAfterCrit: number;
  damageAfterUlt: number;
  critDmgAfterUlt: number;
  glacier: number; // 0 or 1
};

const ZERO_BONUS: SetBonusVec = {
  hpPct: 0,
  atkPct: 0,
  defPct: 0,
  atkSpd: 0,
  critRate: 0,
  critDmg: 0,
  healingEffect: 0,
  rageRegen: 0,
  rageRegenAuto: 0,
  damageTakenNeg: 0,
  aoeDamage: 0,
  stDamage: 0,
  basicAtkDamage: 0,
  damageAfterCrit: 0,
  damageAfterUlt: 0,
  critDmgAfterUlt: 0,
  glacier: 0,
};

function bonusToVec(bonus?: SetStatBonus): SetBonusVec {
  if (!bonus) return ZERO_BONUS;
  return {
    hpPct: bonus.hpPct ?? 0,
    atkPct: bonus.atkPct ?? 0,
    defPct: bonus.defPct ?? 0,
    atkSpd: bonus.atkSpd ?? 0,
    critRate: bonus.critRate ?? 0,
    critDmg: bonus.critDmg ?? 0,
    healingEffect: bonus.healingEffect ?? 0,
    rageRegen: bonus.rageRegen ?? 0,
    rageRegenAuto: bonus.rageRegenAuto ?? 0,
    damageTakenNeg: -(bonus.damageTaken ?? 0),
    aoeDamage: bonus.aoeDamage ?? 0,
    stDamage: bonus.stDamage ?? 0,
    basicAtkDamage: bonus.basicAtkDamage ?? 0,
    damageAfterCrit: bonus.damageAfterCrit ?? 0,
    damageAfterUlt: bonus.damageAfterUlt ?? 0,
    critDmgAfterUlt: bonus.critDmgAfterUlt ?? 0,
    glacier: bonus.glacier ? 1 : 0,
  };
}

function maxBonusVec(list: SetBonusVec[]): SetBonusVec {
  const out: SetBonusVec = { ...ZERO_BONUS };
  for (const b of list) {
    if (b.hpPct > out.hpPct) out.hpPct = b.hpPct;
    if (b.atkPct > out.atkPct) out.atkPct = b.atkPct;
    if (b.defPct > out.defPct) out.defPct = b.defPct;
    if (b.atkSpd > out.atkSpd) out.atkSpd = b.atkSpd;
    if (b.critRate > out.critRate) out.critRate = b.critRate;
    if (b.critDmg > out.critDmg) out.critDmg = b.critDmg;
    if (b.healingEffect > out.healingEffect) out.healingEffect = b.healingEffect;
    if (b.rageRegen > out.rageRegen) out.rageRegen = b.rageRegen;
    if (b.rageRegenAuto > out.rageRegenAuto) out.rageRegenAuto = b.rageRegenAuto;
    if (b.damageTakenNeg > out.damageTakenNeg) out.damageTakenNeg = b.damageTakenNeg;
    if (b.aoeDamage > out.aoeDamage) out.aoeDamage = b.aoeDamage;
    if (b.stDamage > out.stDamage) out.stDamage = b.stDamage;
    if (b.basicAtkDamage > out.basicAtkDamage) out.basicAtkDamage = b.basicAtkDamage;
    if (b.damageAfterCrit > out.damageAfterCrit) out.damageAfterCrit = b.damageAfterCrit;
    if (b.damageAfterUlt > out.damageAfterUlt) out.damageAfterUlt = b.damageAfterUlt;
    if (b.critDmgAfterUlt > out.critDmgAfterUlt) out.critDmgAfterUlt = b.critDmgAfterUlt;
    if (b.glacier > out.glacier) out.glacier = b.glacier;
  }
  return out;
}

type SolverContext = {
  request: OptimizerRequest;
  slots: [PackedSlot, PackedSlot, PackedSlot, PackedSlot, PackedSlot];
  setBonuses: SetBonusVec[];
  desiredLeftIdx: number;
  desiredRightIdx: number;
  armorHasSet: Uint8Array;
  amuletHasSet: Uint8Array;
  ringHasSet: Uint8Array;
  maxLeftBonus: SetBonusVec;
  maxRightBonus: SetBonusVec;
  // Suffix maxima across slots [k..4] for k in 0..5 (index 5 = 0)
  sufFlatHp: Float64Array;
  sufFlatAtk: Float64Array;
  sufFlatDef: Float64Array;
  sufHpPct: Float64Array;
  sufAtkPct: Float64Array;
  sufDefPct: Float64Array;
  sufAtkSpd: Float64Array;
  sufCritRate: Float64Array;
  sufCritDmg: Float64Array;
  sufHeal: Float64Array;
  sufRage: Float64Array;
  // Hero constants
  heroHp: number;
  heroAtk: number;
  heroDef: number;
  heroInterval: number;
  heroRrAuto: number;
  baseAps: number;
  // Weights
  wAtk: number;
  wHp: number;
  wDef: number;
  wCritRate: number;
  wCritDmg: number;
  wAtkSpd: number;
  wHeal: number;
  wRage: number;
  wRageAuto: number;
  wDmgTaken: number;
  wAoe: number;
  wSt: number;
  wBasic: number;
  wAfterCrit: number;
  wAfterUlt: number;
  wCritAfterUlt: number;
  // Minimums (-Infinity if unset)
  mAtk: number;
  mHp: number;
  mDef: number;
  mCritRate: number;
  mCritDmg: number;
  mAtkSpd: number;
  mHeal: number;
  mRage: number;
  mRageAuto: number;
  mDmgTaken: number;
  mAoe: number;
  mSt: number;
  mBasic: number;
  mAfterCrit: number;
  mAfterUlt: number;
  mCritAfterUlt: number;
  hasAnyMin: boolean;
  totalCombos: number;
};

function packSlot(
  pieces: GearPieceInput[],
  request: OptimizerRequest,
  setIdOf: (key: string) => number,
): PackedSlot {
  // Sort descending by single-piece heuristic so strong builds surface early and tighten pruning.
  const sorted = [...pieces].sort((left, right) => {
    const delta = pieceWeightHint(right, request) - pieceWeightHint(left, request);
    if (delta !== 0) return delta;
    return left.id - right.id;
  });
  const count = sorted.length;
  const setIdx = new Int32Array(count);
  const flatHp = new Float64Array(count);
  const flatAtk = new Float64Array(count);
  const flatDef = new Float64Array(count);
  const hpPct = new Float64Array(count);
  const atkPct = new Float64Array(count);
  const defPct = new Float64Array(count);
  const atkSpd = new Float64Array(count);
  const critRate = new Float64Array(count);
  const critDmg = new Float64Array(count);
  const healingEffect = new Float64Array(count);
  const rageRegen = new Float64Array(count);

  for (let i = 0; i < count; i += 1) {
    const piece = sorted[i]!;
    const bag: StatBag = pieceStatBag(piece);
    setIdx[i] = setIdOf(piece.setKey);
    flatHp[i] = bag.flatHp;
    flatAtk[i] = bag.flatAtk;
    flatDef[i] = bag.flatDef;
    hpPct[i] = bag.hpPct;
    atkPct[i] = bag.atkPct;
    defPct[i] = bag.defPct;
    atkSpd[i] = bag.atkSpd;
    critRate[i] = bag.critRate;
    critDmg[i] = bag.critDmg;
    healingEffect[i] = bag.healingEffect;
    rageRegen[i] = bag.rageRegen;
  }

  return {
    pieces: sorted,
    count,
    setIdx,
    flatHp,
    flatAtk,
    flatDef,
    hpPct,
    atkPct,
    defPct,
    atkSpd,
    critRate,
    critDmg,
    healingEffect,
    rageRegen,
  };
}

function slotMax(arr: Float64Array): number {
  let best = 0;
  for (let i = 0; i < arr.length; i += 1) {
    if (arr[i]! > best) best = arr[i]!;
  }
  return best;
}

function buildSolverContext(
  grouped: Record<GearSlot, GearPieceInput[]>,
  request: OptimizerRequest,
): SolverContext {
  const setKeyToIdx = new Map<string, number>();
  const setBonuses: SetBonusVec[] = [];
  const setIdOf = (key: string): number => {
    const existing = setKeyToIdx.get(key);
    if (existing != null) return existing;
    const idx = setBonuses.length;
    setKeyToIdx.set(key, idx);
    setBonuses.push(bonusToVec(SET_BY_KEY[key]?.bonus));
    return idx;
  };

  const wSlot = packSlot(grouped.weapon, request, setIdOf);
  const aSlot = packSlot(grouped.armor, request, setIdOf);
  const bSlot = packSlot(grouped.bangle, request, setIdOf);
  const mSlot = packSlot(grouped.amulet, request, setIdOf);
  const rSlot = packSlot(grouped.ring, request, setIdOf);
  const slots: [PackedSlot, PackedSlot, PackedSlot, PackedSlot, PackedSlot] = [
    wSlot,
    aSlot,
    bSlot,
    mSlot,
    rSlot,
  ];

  const desiredLeftIdx = request.desiredLeftSet
    ? (setKeyToIdx.get(request.desiredLeftSet) ?? -1)
    : -1;
  const desiredRightIdx = request.desiredRightSet
    ? (setKeyToIdx.get(request.desiredRightSet) ?? -1)
    : -1;

  const numSets = setBonuses.length;
  const armorHasSet = new Uint8Array(numSets);
  const amuletHasSet = new Uint8Array(numSets);
  const ringHasSet = new Uint8Array(numSets);
  for (let i = 0; i < aSlot.count; i += 1) armorHasSet[aSlot.setIdx[i]!] = 1;
  for (let i = 0; i < mSlot.count; i += 1) amuletHasSet[mSlot.setIdx[i]!] = 1;
  for (let i = 0; i < rSlot.count; i += 1) ringHasSet[rSlot.setIdx[i]!] = 1;

  const activeLeftBonuses: SetBonusVec[] = [];
  for (let i = 0; i < wSlot.count; i += 1) {
    const s = wSlot.setIdx[i]!;
    if (armorHasSet[s]) activeLeftBonuses.push(setBonuses[s]!);
  }
  const activeRightBonuses: SetBonusVec[] = [];
  for (let i = 0; i < bSlot.count; i += 1) {
    const s = bSlot.setIdx[i]!;
    if (amuletHasSet[s] && ringHasSet[s]) activeRightBonuses.push(setBonuses[s]!);
  }
  const maxLeftBonus = maxBonusVec(activeLeftBonuses);
  const maxRightBonus = maxBonusVec(activeRightBonuses);

  const sufFlatHp = new Float64Array(6);
  const sufFlatAtk = new Float64Array(6);
  const sufFlatDef = new Float64Array(6);
  const sufHpPct = new Float64Array(6);
  const sufAtkPct = new Float64Array(6);
  const sufDefPct = new Float64Array(6);
  const sufAtkSpd = new Float64Array(6);
  const sufCritRate = new Float64Array(6);
  const sufCritDmg = new Float64Array(6);
  const sufHeal = new Float64Array(6);
  const sufRage = new Float64Array(6);

  for (let k = 4; k >= 0; k -= 1) {
    const sl = slots[k]!;
    sufFlatHp[k] = sufFlatHp[k + 1]! + slotMax(sl.flatHp);
    sufFlatAtk[k] = sufFlatAtk[k + 1]! + slotMax(sl.flatAtk);
    sufFlatDef[k] = sufFlatDef[k + 1]! + slotMax(sl.flatDef);
    sufHpPct[k] = sufHpPct[k + 1]! + slotMax(sl.hpPct);
    sufAtkPct[k] = sufAtkPct[k + 1]! + slotMax(sl.atkPct);
    sufDefPct[k] = sufDefPct[k + 1]! + slotMax(sl.defPct);
    sufAtkSpd[k] = sufAtkSpd[k + 1]! + slotMax(sl.atkSpd);
    sufCritRate[k] = sufCritRate[k + 1]! + slotMax(sl.critRate);
    sufCritDmg[k] = sufCritDmg[k + 1]! + slotMax(sl.critDmg);
    sufHeal[k] = sufHeal[k + 1]! + slotMax(sl.healingEffect);
    sufRage[k] = sufRage[k + 1]! + slotMax(sl.rageRegen);
  }

  const w = (k: ScoreStatKey) => {
    const v = request.weights[k] ?? 0;
    return v > 0 ? v : 0;
  };
  const m = (k: ScoreStatKey) => {
    const v = request.minimums[k];
    return v == null || Number.isNaN(v) ? Number.NEGATIVE_INFINITY : v;
  };

  const mAtk = m('atk');
  const mHp = m('hp');
  const mDef = m('def');
  const mCritRate = m('critRate');
  const mCritDmg = m('critDmg');
  const mAtkSpd = m('atkSpd');
  const mHeal = m('healingEffect');
  const mRage = m('rageRegen');
  const mRageAuto = m('rageRegenAuto');
  const mDmgTaken = m('damageTaken');
  const mAoe = m('aoeDamage');
  const mSt = m('stDamage');
  const mBasic = m('basicAtkDamage');
  const mAfterCrit = m('damageAfterCrit');
  const mAfterUlt = m('damageAfterUlt');
  const mCritAfterUlt = m('critDmgAfterUlt');
  const hasAnyMin =
    mAtk > -Infinity ||
    mHp > -Infinity ||
    mDef > -Infinity ||
    mCritRate > -Infinity ||
    mCritDmg > -Infinity ||
    mAtkSpd > -Infinity ||
    mHeal > -Infinity ||
    mRage > -Infinity ||
    mRageAuto > -Infinity ||
    mDmgTaken > -Infinity ||
    mAoe > -Infinity ||
    mSt > -Infinity ||
    mBasic > -Infinity ||
    mAfterCrit > -Infinity ||
    mAfterUlt > -Infinity ||
    mCritAfterUlt > -Infinity;

  return {
    request,
    slots,
    setBonuses,
    desiredLeftIdx,
    desiredRightIdx,
    armorHasSet,
    amuletHasSet,
    ringHasSet,
    maxLeftBonus,
    maxRightBonus,
    sufFlatHp,
    sufFlatAtk,
    sufFlatDef,
    sufHpPct,
    sufAtkPct,
    sufDefPct,
    sufAtkSpd,
    sufCritRate,
    sufCritDmg,
    sufHeal,
    sufRage,
    heroHp: request.hero.hp,
    heroAtk: request.hero.atk,
    heroDef: request.hero.def,
    heroInterval: request.hero.atkInterval,
    heroRrAuto: request.hero.rrAuto,
    baseAps: attacksPerSecond(request.hero.atkInterval, 100),
    wAtk: w('atk'),
    wHp: w('hp'),
    wDef: w('def'),
    wCritRate: w('critRate'),
    wCritDmg: w('critDmg'),
    wAtkSpd: w('atkSpd'),
    wHeal: w('healingEffect'),
    wRage: w('rageRegen'),
    wRageAuto: w('rageRegenAuto'),
    wDmgTaken: w('damageTaken'),
    wAoe: w('aoeDamage'),
    wSt: w('stDamage'),
    wBasic: w('basicAtkDamage'),
    wAfterCrit: w('damageAfterCrit'),
    wAfterUlt: w('damageAfterUlt'),
    wCritAfterUlt: w('critDmgAfterUlt'),
    mAtk,
    mHp,
    mDef,
    mCritRate,
    mCritDmg,
    mAtkSpd,
    mHeal,
    mRage,
    mRageAuto,
    mDmgTaken,
    mAoe,
    mSt,
    mBasic,
    mAfterCrit,
    mAfterUlt,
    mCritAfterUlt,
    hasAnyMin,
    totalCombos: comboCount(grouped),
  };
}

function evalScalarScore(
  ctx: SolverContext,
  flatHp: number,
  flatAtk: number,
  flatDef: number,
  hpPct: number,
  atkPct: number,
  defPct: number,
  atkSpdBonus: number,
  critRate: number,
  critDmg: number,
  heal: number,
  rage: number,
  rightBonus: SetBonusVec,
  leftBonus: SetBonusVec,
  desiredSetScore: number,
): number | null {
  const hp = scaledStat(ctx.heroHp, flatHp, hpPct + leftBonus.hpPct + rightBonus.hpPct);
  let atk = scaledStat(ctx.heroAtk, flatAtk, atkPct + leftBonus.atkPct + rightBonus.atkPct);
  if (leftBonus.glacier || rightBonus.glacier) atk += GLACIER_HP_RATIO * hp;
  const def = scaledStat(ctx.heroDef, flatDef, defPct + leftBonus.defPct + rightBonus.defPct);
  const totalAtkSpd = 100 + atkSpdBonus + leftBonus.atkSpd + rightBonus.atkSpd;
  const totalCritRate = critRate + leftBonus.critRate + rightBonus.critRate;
  const totalCritDmg = critDmg + leftBonus.critDmg + rightBonus.critDmg;
  const totalHeal = heal + leftBonus.healingEffect + rightBonus.healingEffect;
  const totalRage = rage + leftBonus.rageRegen + rightBonus.rageRegen;
  const totalRageAuto = ctx.heroRrAuto + leftBonus.rageRegenAuto + rightBonus.rageRegenAuto;
  const totalDmgTaken = leftBonus.damageTakenNeg + rightBonus.damageTakenNeg;
  const totalAoe = leftBonus.aoeDamage + rightBonus.aoeDamage;
  const totalSt = leftBonus.stDamage + rightBonus.stDamage;
  const totalBasic = leftBonus.basicAtkDamage + rightBonus.basicAtkDamage;
  const totalAfterCrit = leftBonus.damageAfterCrit + rightBonus.damageAfterCrit;
  const totalAfterUlt = leftBonus.damageAfterUlt + rightBonus.damageAfterUlt;
  const totalCritAfterUlt = leftBonus.critDmgAfterUlt + rightBonus.critDmgAfterUlt;

  if (ctx.hasAnyMin) {
    if (
      atk < ctx.mAtk - EPS ||
      hp < ctx.mHp - EPS ||
      def < ctx.mDef - EPS ||
      totalCritRate < ctx.mCritRate - EPS ||
      totalCritDmg < ctx.mCritDmg - EPS ||
      totalAtkSpd < ctx.mAtkSpd - EPS ||
      totalHeal < ctx.mHeal - EPS ||
      totalRage < ctx.mRage - EPS ||
      totalRageAuto < ctx.mRageAuto - EPS ||
      totalDmgTaken < ctx.mDmgTaken - EPS ||
      totalAoe < ctx.mAoe - EPS ||
      totalSt < ctx.mSt - EPS ||
      totalBasic < ctx.mBasic - EPS ||
      totalAfterCrit < ctx.mAfterCrit - EPS ||
      totalAfterUlt < ctx.mAfterUlt - EPS ||
      totalCritAfterUlt < ctx.mCritAfterUlt - EPS
    ) {
      return null;
    }
  }

  let score = desiredSetScore;
  if (ctx.wAtk > 0 && ctx.heroAtk > 0) score += ctx.wAtk * (atk / ctx.heroAtk);
  if (ctx.wHp > 0 && ctx.heroHp > 0) score += ctx.wHp * (hp / ctx.heroHp);
  if (ctx.wDef > 0 && ctx.heroDef > 0) score += ctx.wDef * (def / ctx.heroDef);
  if (ctx.wCritRate > 0) {
    score +=
      ctx.wCritRate *
      ((totalCritRate < CRIT_RATE_SCORE_CAP ? totalCritRate : CRIT_RATE_SCORE_CAP) / 100);
  }
  if (ctx.wCritDmg > 0) score += ctx.wCritDmg * (totalCritDmg / BASE_CRIT_DMG);
  if (ctx.wAtkSpd > 0 && ctx.baseAps > 0) {
    const aps = attacksPerSecond(ctx.heroInterval, totalAtkSpd);
    score += ctx.wAtkSpd * (aps / ctx.baseAps - 1);
  }
  if (ctx.wHeal > 0) score += ctx.wHeal * (healingMultiplier(totalHeal) - 1);
  if (ctx.wRage > 0) score += ctx.wRage * (totalRage / 100);
  if (ctx.wRageAuto > 0) score += ctx.wRageAuto * (totalRageAuto / 100);
  if (ctx.wDmgTaken > 0) score += ctx.wDmgTaken * (totalDmgTaken / 100);
  if (ctx.wAoe > 0) score += ctx.wAoe * (totalAoe / 100);
  if (ctx.wSt > 0) score += ctx.wSt * (totalSt / 100);
  if (ctx.wBasic > 0) score += ctx.wBasic * (totalBasic / 100);
  if (ctx.wAfterCrit > 0) score += ctx.wAfterCrit * (totalAfterCrit / 100);
  if (ctx.wAfterUlt > 0) score += ctx.wAfterUlt * (totalAfterUlt / 100);
  if (ctx.wCritAfterUlt > 0) score += ctx.wCritAfterUlt * (totalCritAfterUlt / 100);
  return score;
}

type BestEntry = {
  score: number;
  wIdx: number;
  aIdx: number;
  bIdx: number;
  mIdx: number;
  rIdx: number;
};

function insertBest(
  best: BestEntry[],
  score: number,
  wIdx: number,
  aIdx: number,
  bIdx: number,
  mIdx: number,
  rIdx: number,
): number {
  if (best.length >= RESULT_COUNT && score <= best[RESULT_COUNT - 1]!.score) {
    return best[RESULT_COUNT - 1]!.score;
  }
  best.push({ score, wIdx, aIdx, bIdx, mIdx, rIdx });
  best.sort((left, right) => right.score - left.score);
  if (best.length > RESULT_COUNT) best.length = RESULT_COUNT;
  return best.length >= RESULT_COUNT ? best[RESULT_COUNT - 1]!.score : Number.NEGATIVE_INFINITY;
}

function materializeBest(ctx: SolverContext, best: BestEntry[]): RankedLoadout[] {
  const [wSlot, aSlot, bSlot, mSlot, rSlot] = ctx.slots;
  return best.map((entry) => {
    const pieces = [
      wSlot.pieces[entry.wIdx]!,
      aSlot.pieces[entry.aIdx]!,
      bSlot.pieces[entry.bIdx]!,
      mSlot.pieces[entry.mIdx]!,
      rSlot.pieces[entry.rIdx]!,
    ];
    const stats = computeFinalStats(ctx.request.hero, loadoutStatBag(pieces));
    return { score: entry.score, pieces, stats };
  });
}

function canBeatThreshold(
  ctx: SolverContext,
  nextSlot: number,
  flatHp: number,
  flatAtk: number,
  flatDef: number,
  hpPct: number,
  atkPct: number,
  defPct: number,
  atkSpd: number,
  critRate: number,
  critDmg: number,
  heal: number,
  rage: number,
  leftBonusBound: SetBonusVec,
  rightBonusBound: SetBonusVec,
  desiredSetBound: number,
  threshold: number,
): boolean {
  const ub = evalScalarScore(
    ctx,
    flatHp + ctx.sufFlatHp[nextSlot]!,
    flatAtk + ctx.sufFlatAtk[nextSlot]!,
    flatDef + ctx.sufFlatDef[nextSlot]!,
    hpPct + ctx.sufHpPct[nextSlot]!,
    atkPct + ctx.sufAtkPct[nextSlot]!,
    defPct + ctx.sufDefPct[nextSlot]!,
    atkSpd + ctx.sufAtkSpd[nextSlot]!,
    critRate + ctx.sufCritRate[nextSlot]!,
    critDmg + ctx.sufCritDmg[nextSlot]!,
    heal + ctx.sufHeal[nextSlot]!,
    rage + ctx.sufRage[nextSlot]!,
    rightBonusBound,
    leftBonusBound,
    desiredSetBound,
  );
  if (ub === null) return false;
  if (threshold > Number.NEGATIVE_INFINITY && ub <= threshold + EPS) return false;
  return true;
}

function runBranchAndBoundSync(ctx: SolverContext): RankedLoadout[] {
  const [wSlot, aSlot, bSlot, mSlot, rSlot] = ctx.slots;
  const best: BestEntry[] = [];
  let threshold = Number.NEGATIVE_INFINITY;
  const hasDesiredRight = ctx.desiredRightIdx >= 0 ? 1 : 0;

  for (let wi = 0; wi < wSlot.count; wi += 1) {
    const wSet = wSlot.setIdx[wi]!;
    const leftBound = ctx.armorHasSet[wSet] ? ctx.setBonuses[wSet]! : ZERO_BONUS;
    const desiredLeftBound =
      ctx.desiredLeftIdx >= 0 && wSet === ctx.desiredLeftIdx && ctx.armorHasSet[wSet] ? 1 : 0;

    const fh1 = wSlot.flatHp[wi]!;
    const fa1 = wSlot.flatAtk[wi]!;
    const fd1 = wSlot.flatDef[wi]!;
    const hp1 = wSlot.hpPct[wi]!;
    const ap1 = wSlot.atkPct[wi]!;
    const dp1 = wSlot.defPct[wi]!;
    const as1 = wSlot.atkSpd[wi]!;
    const cr1 = wSlot.critRate[wi]!;
    const cd1 = wSlot.critDmg[wi]!;
    const he1 = wSlot.healingEffect[wi]!;
    const rg1 = wSlot.rageRegen[wi]!;

    if (
      !canBeatThreshold(
        ctx,
        1,
        fh1,
        fa1,
        fd1,
        hp1,
        ap1,
        dp1,
        as1,
        cr1,
        cd1,
        he1,
        rg1,
        leftBound,
        ctx.maxRightBonus,
        desiredLeftBound + hasDesiredRight,
        threshold,
      )
    ) {
      continue;
    }

    for (let ai = 0; ai < aSlot.count; ai += 1) {
      const leftMatched = aSlot.setIdx[ai] === wSet;
      const leftBonus = leftMatched ? ctx.setBonuses[wSet]! : ZERO_BONUS;
      const desiredLeftScore = leftMatched && wSet === ctx.desiredLeftIdx ? 1 : 0;

      const fh2 = fh1 + aSlot.flatHp[ai]!;
      const fa2 = fa1 + aSlot.flatAtk[ai]!;
      const fd2 = fd1 + aSlot.flatDef[ai]!;
      const hp2 = hp1 + aSlot.hpPct[ai]!;
      const ap2 = ap1 + aSlot.atkPct[ai]!;
      const dp2 = dp1 + aSlot.defPct[ai]!;
      const as2 = as1 + aSlot.atkSpd[ai]!;
      const cr2 = cr1 + aSlot.critRate[ai]!;
      const cd2 = cd1 + aSlot.critDmg[ai]!;
      const he2 = he1 + aSlot.healingEffect[ai]!;
      const rg2 = rg1 + aSlot.rageRegen[ai]!;

      if (
        !canBeatThreshold(
          ctx,
          2,
          fh2,
          fa2,
          fd2,
          hp2,
          ap2,
          dp2,
          as2,
          cr2,
          cd2,
          he2,
          rg2,
          leftBonus,
          ctx.maxRightBonus,
          desiredLeftScore + hasDesiredRight,
          threshold,
        )
      ) {
        continue;
      }

      for (let bi = 0; bi < bSlot.count; bi += 1) {
        const bSet = bSlot.setIdx[bi]!;
        const rightPossible = Boolean(ctx.amuletHasSet[bSet] && ctx.ringHasSet[bSet]);
        const rightBoundB = rightPossible ? ctx.setBonuses[bSet]! : ZERO_BONUS;
        const desiredRightBoundB = rightPossible && bSet === ctx.desiredRightIdx ? 1 : 0;

        const fh3 = fh2 + bSlot.flatHp[bi]!;
        const fa3 = fa2 + bSlot.flatAtk[bi]!;
        const fd3 = fd2 + bSlot.flatDef[bi]!;
        const hp3 = hp2 + bSlot.hpPct[bi]!;
        const ap3 = ap2 + bSlot.atkPct[bi]!;
        const dp3 = dp2 + bSlot.defPct[bi]!;
        const as3 = as2 + bSlot.atkSpd[bi]!;
        const cr3 = cr2 + bSlot.critRate[bi]!;
        const cd3 = cd2 + bSlot.critDmg[bi]!;
        const he3 = he2 + bSlot.healingEffect[bi]!;
        const rg3 = rg2 + bSlot.rageRegen[bi]!;

        if (
          !canBeatThreshold(
            ctx,
            3,
            fh3,
            fa3,
            fd3,
            hp3,
            ap3,
            dp3,
            as3,
            cr3,
            cd3,
            he3,
            rg3,
            leftBonus,
            rightBoundB,
            desiredLeftScore + desiredRightBoundB,
            threshold,
          )
        ) {
          continue;
        }

        for (let mi = 0; mi < mSlot.count; mi += 1) {
          const rightStillMatch = mSlot.setIdx[mi] === bSet && Boolean(ctx.ringHasSet[bSet]);
          const rightBoundM = rightStillMatch ? ctx.setBonuses[bSet]! : ZERO_BONUS;
          const desiredRightBoundM = rightStillMatch && bSet === ctx.desiredRightIdx ? 1 : 0;

          const fh4 = fh3 + mSlot.flatHp[mi]!;
          const fa4 = fa3 + mSlot.flatAtk[mi]!;
          const fd4 = fd3 + mSlot.flatDef[mi]!;
          const hp4 = hp3 + mSlot.hpPct[mi]!;
          const ap4 = ap3 + mSlot.atkPct[mi]!;
          const dp4 = dp3 + mSlot.defPct[mi]!;
          const as4 = as3 + mSlot.atkSpd[mi]!;
          const cr4 = cr3 + mSlot.critRate[mi]!;
          const cd4 = cd3 + mSlot.critDmg[mi]!;
          const he4 = he3 + mSlot.healingEffect[mi]!;
          const rg4 = rg3 + mSlot.rageRegen[mi]!;

          if (
            !canBeatThreshold(
              ctx,
              4,
              fh4,
              fa4,
              fd4,
              hp4,
              ap4,
              dp4,
              as4,
              cr4,
              cd4,
              he4,
              rg4,
              leftBonus,
              rightBoundM,
              desiredLeftScore + desiredRightBoundM,
              threshold,
            )
          ) {
            continue;
          }

          for (let ri = 0; ri < rSlot.count; ri += 1) {
            const rightMatched = rightStillMatch && rSlot.setIdx[ri] === bSet;
            const rightBonus = rightMatched ? ctx.setBonuses[bSet]! : ZERO_BONUS;
            const desiredScore =
              desiredLeftScore + (rightMatched && bSet === ctx.desiredRightIdx ? 1 : 0);

            const score = evalScalarScore(
              ctx,
              fh4 + rSlot.flatHp[ri]!,
              fa4 + rSlot.flatAtk[ri]!,
              fd4 + rSlot.flatDef[ri]!,
              hp4 + rSlot.hpPct[ri]!,
              ap4 + rSlot.atkPct[ri]!,
              dp4 + rSlot.defPct[ri]!,
              as4 + rSlot.atkSpd[ri]!,
              cr4 + rSlot.critRate[ri]!,
              cd4 + rSlot.critDmg[ri]!,
              he4 + rSlot.healingEffect[ri]!,
              rg4 + rSlot.rageRegen[ri]!,
              rightBonus,
              leftBonus,
              desiredScore,
            );
            if (score !== null) {
              threshold = insertBest(best, score, wi, ai, bi, mi, ri);
            }
          }
        }
      }
    }
  }

  return materializeBest(ctx, best);
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

async function runBranchAndBoundAsync(
  ctx: SolverContext,
  onProgress?: OptimizerProgress,
  signal?: AbortSignal,
): Promise<RankedLoadout[]> {
  const [wSlot, aSlot, bSlot, mSlot, rSlot] = ctx.slots;
  const best: BestEntry[] = [];
  let threshold = Number.NEGATIVE_INFINITY;
  const hasDesiredRight = ctx.desiredRightIdx >= 0 ? 1 : 0;

  const total = ctx.totalCombos;
  const subPerWeapon = aSlot.count * bSlot.count * mSlot.count * rSlot.count;
  const subPerArmor = bSlot.count * mSlot.count * rSlot.count;
  const subPerBangle = mSlot.count * rSlot.count;
  const subPerAmulet = rSlot.count;

  let done = 0;
  let stepsSinceYield = 0;
  let lastReportedPct = -1;
  const report = () => {
    if (!onProgress) return;
    const pct = total > 0 ? Math.floor((done / total) * 100) : 100;
    if (pct !== lastReportedPct || done >= total) {
      lastReportedPct = pct;
      onProgress(Math.min(done, total), total);
      signal?.throwIfAborted();
    }
  };
  onProgress?.(0, total);
  signal?.throwIfAborted();

  for (let wi = 0; wi < wSlot.count; wi += 1) {
    const wSet = wSlot.setIdx[wi]!;
    const leftBound = ctx.armorHasSet[wSet] ? ctx.setBonuses[wSet]! : ZERO_BONUS;
    const desiredLeftBound =
      ctx.desiredLeftIdx >= 0 && wSet === ctx.desiredLeftIdx && ctx.armorHasSet[wSet] ? 1 : 0;

    const fh1 = wSlot.flatHp[wi]!;
    const fa1 = wSlot.flatAtk[wi]!;
    const fd1 = wSlot.flatDef[wi]!;
    const hp1 = wSlot.hpPct[wi]!;
    const ap1 = wSlot.atkPct[wi]!;
    const dp1 = wSlot.defPct[wi]!;
    const as1 = wSlot.atkSpd[wi]!;
    const cr1 = wSlot.critRate[wi]!;
    const cd1 = wSlot.critDmg[wi]!;
    const he1 = wSlot.healingEffect[wi]!;
    const rg1 = wSlot.rageRegen[wi]!;

    if (
      !canBeatThreshold(
        ctx,
        1,
        fh1,
        fa1,
        fd1,
        hp1,
        ap1,
        dp1,
        as1,
        cr1,
        cd1,
        he1,
        rg1,
        leftBound,
        ctx.maxRightBonus,
        desiredLeftBound + hasDesiredRight,
        threshold,
      )
    ) {
      done += subPerWeapon;
      report();
      continue;
    }

    for (let ai = 0; ai < aSlot.count; ai += 1) {
      const leftMatched = aSlot.setIdx[ai] === wSet;
      const leftBonus = leftMatched ? ctx.setBonuses[wSet]! : ZERO_BONUS;
      const desiredLeftScore = leftMatched && wSet === ctx.desiredLeftIdx ? 1 : 0;

      const fh2 = fh1 + aSlot.flatHp[ai]!;
      const fa2 = fa1 + aSlot.flatAtk[ai]!;
      const fd2 = fd1 + aSlot.flatDef[ai]!;
      const hp2 = hp1 + aSlot.hpPct[ai]!;
      const ap2 = ap1 + aSlot.atkPct[ai]!;
      const dp2 = dp1 + aSlot.defPct[ai]!;
      const as2 = as1 + aSlot.atkSpd[ai]!;
      const cr2 = cr1 + aSlot.critRate[ai]!;
      const cd2 = cd1 + aSlot.critDmg[ai]!;
      const he2 = he1 + aSlot.healingEffect[ai]!;
      const rg2 = rg1 + aSlot.rageRegen[ai]!;

      if (
        !canBeatThreshold(
          ctx,
          2,
          fh2,
          fa2,
          fd2,
          hp2,
          ap2,
          dp2,
          as2,
          cr2,
          cd2,
          he2,
          rg2,
          leftBonus,
          ctx.maxRightBonus,
          desiredLeftScore + hasDesiredRight,
          threshold,
        )
      ) {
        done += subPerArmor;
        report();
        continue;
      }

      for (let bi = 0; bi < bSlot.count; bi += 1) {
        const bSet = bSlot.setIdx[bi]!;
        const rightPossible = Boolean(ctx.amuletHasSet[bSet] && ctx.ringHasSet[bSet]);
        const rightBoundB = rightPossible ? ctx.setBonuses[bSet]! : ZERO_BONUS;
        const desiredRightBoundB = rightPossible && bSet === ctx.desiredRightIdx ? 1 : 0;

        const fh3 = fh2 + bSlot.flatHp[bi]!;
        const fa3 = fa2 + bSlot.flatAtk[bi]!;
        const fd3 = fd2 + bSlot.flatDef[bi]!;
        const hp3 = hp2 + bSlot.hpPct[bi]!;
        const ap3 = ap2 + bSlot.atkPct[bi]!;
        const dp3 = dp2 + bSlot.defPct[bi]!;
        const as3 = as2 + bSlot.atkSpd[bi]!;
        const cr3 = cr2 + bSlot.critRate[bi]!;
        const cd3 = cd2 + bSlot.critDmg[bi]!;
        const he3 = he2 + bSlot.healingEffect[bi]!;
        const rg3 = rg2 + bSlot.rageRegen[bi]!;

        if (
          !canBeatThreshold(
            ctx,
            3,
            fh3,
            fa3,
            fd3,
            hp3,
            ap3,
            dp3,
            as3,
            cr3,
            cd3,
            he3,
            rg3,
            leftBonus,
            rightBoundB,
            desiredLeftScore + desiredRightBoundB,
            threshold,
          )
        ) {
          done += subPerBangle;
          report();
          continue;
        }

        for (let mi = 0; mi < mSlot.count; mi += 1) {
          const rightStillMatch = mSlot.setIdx[mi] === bSet && Boolean(ctx.ringHasSet[bSet]);
          const rightBoundM = rightStillMatch ? ctx.setBonuses[bSet]! : ZERO_BONUS;
          const desiredRightBoundM = rightStillMatch && bSet === ctx.desiredRightIdx ? 1 : 0;

          const fh4 = fh3 + mSlot.flatHp[mi]!;
          const fa4 = fa3 + mSlot.flatAtk[mi]!;
          const fd4 = fd3 + mSlot.flatDef[mi]!;
          const hp4 = hp3 + mSlot.hpPct[mi]!;
          const ap4 = ap3 + mSlot.atkPct[mi]!;
          const dp4 = dp3 + mSlot.defPct[mi]!;
          const as4 = as3 + mSlot.atkSpd[mi]!;
          const cr4 = cr3 + mSlot.critRate[mi]!;
          const cd4 = cd3 + mSlot.critDmg[mi]!;
          const he4 = he3 + mSlot.healingEffect[mi]!;
          const rg4 = rg3 + mSlot.rageRegen[mi]!;

          if (
            !canBeatThreshold(
              ctx,
              4,
              fh4,
              fa4,
              fd4,
              hp4,
              ap4,
              dp4,
              as4,
              cr4,
              cd4,
              he4,
              rg4,
              leftBonus,
              rightBoundM,
              desiredLeftScore + desiredRightBoundM,
              threshold,
            )
          ) {
            done += subPerAmulet;
            continue;
          }

          for (let ri = 0; ri < rSlot.count; ri += 1) {
            const rightMatched = rightStillMatch && rSlot.setIdx[ri] === bSet;
            const rightBonus = rightMatched ? ctx.setBonuses[bSet]! : ZERO_BONUS;
            const desiredScore =
              desiredLeftScore + (rightMatched && bSet === ctx.desiredRightIdx ? 1 : 0);

            const score = evalScalarScore(
              ctx,
              fh4 + rSlot.flatHp[ri]!,
              fa4 + rSlot.flatAtk[ri]!,
              fd4 + rSlot.flatDef[ri]!,
              hp4 + rSlot.hpPct[ri]!,
              ap4 + rSlot.atkPct[ri]!,
              dp4 + rSlot.defPct[ri]!,
              as4 + rSlot.atkSpd[ri]!,
              cr4 + rSlot.critRate[ri]!,
              cd4 + rSlot.critDmg[ri]!,
              he4 + rSlot.healingEffect[ri]!,
              rg4 + rSlot.rageRegen[ri]!,
              rightBonus,
              leftBonus,
              desiredScore,
            );
            if (score !== null) {
              threshold = insertBest(best, score, wi, ai, bi, mi, ri);
            }
          }

          done += subPerAmulet;
          stepsSinceYield += subPerAmulet;
          if (stepsSinceYield >= SEARCH_YIELD_EVERY) {
            stepsSinceYield = 0;
            report();
            await yieldEventLoop();
            signal?.throwIfAborted();
          }
        }
        report();
      }
    }
  }

  onProgress?.(total, total);
  return materializeBest(ctx, best);
}

function prepareGrouped(request: OptimizerRequest): Record<GearSlot, GearPieceInput[]> | null {
  const inventory = filterInventory(request);
  let grouped = bySlot(inventory);
  for (const slot of GEAR_SLOTS) {
    if (grouped[slot].length === 0) return null;
  }
  if (comboCount(grouped) > FULL_ENUM_LIMIT) {
    grouped = pruneSlots(grouped, request);
  }
  return grouped;
}

export function optimizeLoadouts(request: OptimizerRequest): RankedLoadout[] {
  const grouped = prepareGrouped(request);
  if (!grouped) return [];
  return runBranchAndBoundSync(buildSolverContext(grouped, request));
}

export async function optimizeLoadoutsAsync(
  request: OptimizerRequest,
  onProgress?: OptimizerProgress,
  signal?: AbortSignal,
): Promise<RankedLoadout[]> {
  const grouped = prepareGrouped(request);
  if (!grouped) {
    onProgress?.(1, 1);
    return [];
  }
  signal?.throwIfAborted();
  return runBranchAndBoundAsync(buildSolverContext(grouped, request), onProgress, signal);
}

import { z } from 'zod';

import {
  ARTIFACT_LEVEL_MAX,
  ARTIFACT_LEVEL_MIN,
  ARTIFACT_PROMOTION_MAX,
  ARTIFACT_SECONDARY_STATS,
  GEAR_PREFIXES,
  GEAR_SLOTS,
  GEAR_STAT_KEYS,
  SLOT_MAIN_STATS,
  maxLevelForPromotion,
  type ArtifactSecondaryStat,
  type GearPrefix,
  type GearSlot,
  type GearStatKey,
} from './catalog.js';
import { SET_BY_KEY } from './sets.js';

const optionalText = z.preprocess((value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}, z.string().nullable());

function firstIssue(error: z.ZodError, field: string) {
  return error.issues.find((issue) => issue.path[0] === field);
}

export const accountNameSchema = z.preprocess(
  (value) => (value == null ? '' : String(value)),
  z.string().trim().min(1).max(128),
);

export const accountIdSchema = z.coerce.number().int().positive();

export const gearBodySchema = z.object({
  slot: z.enum(GEAR_SLOTS),
  set_key: z.preprocess((value) => (value == null ? '' : String(value)), z.string()),
  prefix: z.preprocess((value) => (value == null ? 'none' : value), z.enum(GEAR_PREFIXES)),
  main_stat: z.enum(GEAR_STAT_KEYS),
  main_value: z.coerce.number().positive(),
  main_bonus: z.preprocess(
    (value) => (value == null || value === '' ? 0 : value),
    z.coerce.number().nonnegative(),
  ),
  substats: z.preprocess(
    (value) => (Array.isArray(value) ? value : []),
    z
      .array(
        z.object({
          stat: z.enum(GEAR_STAT_KEYS),
          value: z.coerce.number().nonnegative(),
        }),
      )
      .max(4),
  ),
  exclusive_hero_slug: optionalText,
  exclusive_faction: optionalText,
  equipped_hero_slug: optionalText,
});

export type GearBody = {
  write: {
    slot: GearSlot;
    set_key: string;
    prefix: GearPrefix;
    main_stat: GearStatKey;
    main_value: number;
    main_bonus: number;
    substats: { stat: GearStatKey; value: number }[];
    exclusive_hero_slug: string | null;
    exclusive_faction: string | null;
  };
  equipped_hero_slug: string | null;
};

function gearSchemaError(error: z.ZodError): string {
  if (firstIssue(error, 'slot')) return 'Invalid slot.';
  if (firstIssue(error, 'prefix')) return 'Invalid prefix.';
  if (firstIssue(error, 'main_stat')) return 'Invalid main stat for this slot.';
  if (firstIssue(error, 'main_value')) return 'Main stat value must be greater than 0.';
  if (firstIssue(error, 'main_bonus')) return 'Main bonus must be 0 or more.';
  const sub = error.issues.find((issue) => issue.path[0] === 'substats');
  if (sub) {
    if (sub.code === 'too_big') return 'At most 4 substats.';
    if (sub.path[2] === 'stat') return 'Invalid substat type.';
    if (sub.path[2] === 'value') return 'Invalid substat value.';
    return 'Invalid substat.';
  }
  return 'Invalid body.';
}

export function parseGearBody(body: unknown): GearBody | string {
  if (!body || typeof body !== 'object') return 'Invalid body.';
  const parsed = gearBodySchema.safeParse(body);
  if (!parsed.success) return gearSchemaError(parsed.error);
  const value = parsed.data;
  const set = SET_BY_KEY[value.set_key];
  if (!set) return 'Unknown set.';
  const isLeft = value.slot === 'weapon' || value.slot === 'armor';
  if ((isLeft && set.side !== 'left') || (!isLeft && set.side !== 'right')) {
    return 'Set does not match that slot.';
  }
  if (!SLOT_MAIN_STATS[value.slot].includes(value.main_stat)) {
    return 'Invalid main stat for this slot.';
  }
  if (value.exclusive_hero_slug && value.exclusive_faction) {
    return 'Hero exclusive and faction exclusive cannot both be set.';
  }
  if (value.exclusive_faction && value.slot !== 'ring') {
    return 'Faction exclusive is only valid on rings.';
  }
  if (value.exclusive_hero_slug && value.slot === 'ring') {
    return 'Hero exclusive is not valid on rings.';
  }
  return {
    write: {
      slot: value.slot,
      set_key: value.set_key,
      prefix: value.prefix,
      main_stat: value.main_stat,
      main_value: value.main_value,
      main_bonus: value.main_bonus,
      substats: value.substats,
      exclusive_hero_slug: value.exclusive_hero_slug,
      exclusive_faction: value.exclusive_faction,
    },
    equipped_hero_slug: value.equipped_hero_slug,
  };
}

const nonnegative = z.preprocess(
  (value) => (value == null || value === '' ? 0 : value),
  z.coerce.number().nonnegative(),
);

export const artifactBodySchema = z.object({
  catalog_slug: z.preprocess((value) => (value == null ? '' : String(value)), z.string().trim()),
  level: z.coerce.number().int().min(ARTIFACT_LEVEL_MIN).max(ARTIFACT_LEVEL_MAX),
  promotion: z.preprocess(
    (value) => (value == null || value === '' ? 0 : value),
    z.coerce.number().int().min(0).max(ARTIFACT_PROMOTION_MAX),
  ),
  hp_base: z.coerce.number().nonnegative(),
  hp_bonus: nonnegative,
  atk_base: z.coerce.number().nonnegative(),
  atk_bonus: nonnegative,
});

export type ArtifactBody = {
  catalog_slug: string;
  level: number;
  promotion: number;
  hp_base: number;
  hp_bonus: number;
  atk_base: number;
  atk_bonus: number;
  secondary_stat: ArtifactSecondaryStat | null;
  secondary_value: number | null;
};

function artifactSchemaError(error: z.ZodError): string {
  if (firstIssue(error, 'level'))
    return `Level must be ${ARTIFACT_LEVEL_MIN}-${ARTIFACT_LEVEL_MAX}.`;
  if (firstIssue(error, 'promotion')) return `Promotion must be 0-${ARTIFACT_PROMOTION_MAX}.`;
  if (firstIssue(error, 'hp_base')) return 'HP base must be 0 or more.';
  if (firstIssue(error, 'hp_bonus')) return 'HP bonus must be 0 or more.';
  if (firstIssue(error, 'atk_base')) return 'ATK base must be 0 or more.';
  if (firstIssue(error, 'atk_bonus')) return 'ATK bonus must be 0 or more.';
  return 'Invalid body.';
}

export function parseArtifactBody(
  body: unknown,
  knownSlugs: ReadonlySet<string>,
): ArtifactBody | string {
  if (!body || typeof body !== 'object') return 'Invalid body.';
  const record = body as Record<string, unknown>;
  const parsed = artifactBodySchema.safeParse(record);
  if (!parsed.success) {
    if (!String(record.catalog_slug ?? '').trim()) return 'Pick an artifact.';
    return artifactSchemaError(parsed.error);
  }
  if (!parsed.data.catalog_slug) return 'Pick an artifact.';
  if (!knownSlugs.has(parsed.data.catalog_slug)) return 'Unknown artifact.';
  if (parsed.data.level > maxLevelForPromotion(parsed.data.promotion)) {
    return `Level ${parsed.data.level} is above promotion ${parsed.data.promotion} max.`;
  }
  const rawSecondary = record.secondary_stat;
  let secondaryStat: ArtifactSecondaryStat | null = null;
  let secondaryValue: number | null = null;
  if (typeof rawSecondary === 'string' && rawSecondary.trim()) {
    const secondary = z.enum(ARTIFACT_SECONDARY_STATS).safeParse(rawSecondary);
    if (!secondary.success) return 'Invalid secondary stat.';
    const value = z.coerce.number().nonnegative().safeParse(record.secondary_value);
    if (!value.success) return 'Invalid secondary value.';
    secondaryStat = secondary.data;
    secondaryValue = value.data;
  }
  return { ...parsed.data, secondary_stat: secondaryStat, secondary_value: secondaryValue };
}

export const outfitHeroSchema = z.preprocess(
  (value) => (value == null ? '' : String(value)),
  z.string().trim(),
);

export const outfitPieceIdsSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : []),
  z.array(z.coerce.number().int().positive()).length(5),
);

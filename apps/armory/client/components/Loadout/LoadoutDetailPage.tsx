import { MaterialSymbol } from '@dark-avian-labs/ui';
import { apiFetch } from '@dark-avian-labs/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';

import { APP_PATHS, buildLoadoutPath, buildReadOnlyPath } from '../../app/paths';
import { useModCatalog } from '../../hooks/useModCatalog';
import type { Warframe, Weapon, ModSlot, EquipmentType, StoredBuild } from '../../types/warframe';
import { extractArchonShardBonuses } from '../../utils/archonShardBonuses';
import {
  type EquipmentLookupRow,
  getLoadoutSlotDisplayLabel,
} from '../../utils/buildCatalogCategory';
import { calculateWeaponDps } from '../../utils/damageCalc';
import { getModTypesForEquipment, NO_MOD_TYPES_FOR_EQUIPMENT } from '../../utils/equipmentModTypes';
import { linkifyPlainText } from '../../utils/linkifyText';
import { loadEquipmentLookup } from '../../utils/loadEquipmentLookup';
import { hydrateSlotsWithModCatalog } from '../../utils/modCatalogHydration';
import { parseStoredBuildFromApi } from '../../utils/parseStoredBuildFromApi';
import { calculateWarframeStats } from '../../utils/warframeCalc';

type LookupRecord = Record<string, Record<string, unknown>>;

const WARFRAME_LIKE: EquipmentType[] = ['warframe', 'archwing', 'necramech', 'companion'];
const WEAPON_LIKE: EquipmentType[] = [
  'primary',
  'secondary',
  'melee',
  'archgun',
  'archmelee',
  'beast_claws',
];

function isWarframeLike(t: EquipmentType): boolean {
  return WARFRAME_LIKE.includes(t);
}

function isWeaponLike(t: EquipmentType): boolean {
  return WEAPON_LIKE.includes(t);
}

export function LoadoutDetailPage() {
  const { loadoutId } = useParams<{ loadoutId: string }>();
  const shareTokenParam = useSearchParams()[0].get('token');
  const navigate = useNavigate();
  const [loadoutName, setLoadoutName] = useState('');
  const [loadoutDescription, setLoadoutDescription] = useState('');
  const [visibility, setVisibility] = useState<string>('private');
  const [isOwn, setIsOwn] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState<boolean | null>(null);
  const [entries, setEntries] = useState<Array<{ slot_type: string; build: StoredBuild }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [equipmentLookup, setEquipmentLookup] = useState<LookupRecord>({});

  useEffect(() => {
    let alive = true;
    void loadEquipmentLookup().then((nextLookup) => {
      if (!alive) return;
      setEquipmentLookup(nextLookup as LookupRecord);
      return undefined;
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!loadoutId) return;
    let alive = true;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const tokenQuery = shareTokenParam ? `?token=${encodeURIComponent(shareTokenParam)}` : '';
        const res = await apiFetch(`/api/loadouts/${encodeURIComponent(loadoutId)}${tokenQuery}`);
        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errBody?.error ?? `Failed to load loadout (${res.status})`);
        }
        const body = (await res.json()) as {
          loadout?: {
            name?: string;
            visibility?: string;
            share_token?: string | null;
            description?: string | null;
            builds?: Array<{ slot_type: string; build?: Record<string, unknown> }>;
          };
          is_own?: boolean;
        };
        if (!alive) return;
        const lo = body.loadout;
        if (!lo) {
          setError('Invalid response');
          setEntries([]);
          return;
        }
        setLoadoutName(typeof lo.name === 'string' ? lo.name : 'Loadout');
        setLoadoutDescription(typeof lo.description === 'string' ? lo.description : '');
        setVisibility(typeof lo.visibility === 'string' ? lo.visibility : 'private');
        setIsOwn(body.is_own === true);
        setShareToken(typeof lo.share_token === 'string' ? lo.share_token : null);
        const raw = Array.isArray(lo.builds) ? lo.builds : [];
        const parsed = raw
          .map((row) => {
            const b = row.build;
            if (!b || typeof b !== 'object') return null;
            const stored = parseStoredBuildFromApi(b as Record<string, unknown>);
            if (!stored) return null;
            return { slot_type: String(row.slot_type ?? ''), build: stored };
          })
          .filter((e): e is { slot_type: string; build: StoredBuild } => Boolean(e));
        setEntries(parsed);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Failed to load loadout');
        setEntries([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadoutId, shareTokenParam]);

  const lookupRows = equipmentLookup as Record<string, EquipmentLookupRow>;

  return (
    <div className="mx-auto max-w-[2000px] space-y-4">
      <div className="glass-shell flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          className="border-glass-border text-muted hover:border-glass-border-hover hover:bg-glass-hover hover:text-foreground inline-flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition-[color,background-color,border-color] duration-200"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <MaterialSymbol name="arrow_back" style={{ fontSize: 22 }} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-foreground truncate text-lg font-semibold">
            {loadoutName || 'Loadout'}
          </h1>
          <p className="text-muted text-xs">
            {visibility === 'public'
              ? 'Public loadout'
              : visibility === 'unlisted'
                ? 'Unlisted'
                : 'Private'}{' '}
            · {entries.length} linked build{entries.length === 1 ? '' : 's'}
          </p>
        </div>
        {isOwn && visibility === 'unlisted' && shareToken && loadoutId ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const url = `${window.location.origin}${buildLoadoutPath(loadoutId)}?token=${encodeURIComponent(shareToken)}`;
              navigator.clipboard.writeText(url).then(
                () => setLinkCopied(true),
                () => setLinkCopied(false),
              );
            }}
          >
            {linkCopied === null ? 'Copy share link' : linkCopied ? 'Link copied' : 'Copy failed'}
          </button>
        ) : null}
        {isOwn ? (
          <Link className="btn btn-secondary btn-sm" to={APP_PATHS.myBuilds}>
            Manage on My Builds
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="glass-shell flex h-48 items-center justify-center">
          <p className="text-muted text-sm">Loading loadout…</p>
        </div>
      ) : error ? (
        <div className="glass-shell flex h-48 flex-col items-center justify-center gap-2 p-6">
          <p className="text-danger text-sm">{error}</p>
          <Link className="text-accent text-sm" to={APP_PATHS.myBuilds}>
            Back to My Builds
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {loadoutDescription.trim() ? (
            <div className="glass-shell text-foreground/90 border-glass-border border border-dashed px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {linkifyPlainText(loadoutDescription)}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {entries.map(({ slot_type, build }) => (
              <LoadoutBuildSummaryCard
                key={`${slot_type}:${build.id}`}
                build={build}
                slotLabel={getLoadoutSlotDisplayLabel(build, slot_type, lookupRows)}
                buildHref={
                  buildReadOnlyPath(build.id) +
                  (shareTokenParam && loadoutId
                    ? `&loadout=${encodeURIComponent(loadoutId)}&token=${encodeURIComponent(shareTokenParam)}`
                    : '')
                }
                equipmentRow={equipmentLookup[build.equipment_unique_name]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function LoadoutBuildSummaryCard({
  build,
  slotLabel,
  buildHref,
  equipmentRow,
}: {
  build: StoredBuild;
  slotLabel: string;
  buildHref: string;
  equipmentRow?: Record<string, unknown>;
}) {
  const navigate = useNavigate();
  const modTypes = getModTypesForEquipment(build.equipment_type);
  const { data: modCatalog } = useModCatalog(
    modTypes !== NO_MOD_TYPES_FOR_EQUIPMENT
      ? `/api/mods?types=${encodeURIComponent(modTypes)}`
      : null,
  );
  const slots = useMemo(
    () =>
      hydrateSlotsWithModCatalog(
        (Array.isArray(build.slots) ? build.slots : []) as ModSlot[],
        new Map((modCatalog?.items ?? []).map((mod) => [mod.unique_name, mod])),
      ),
    [build.slots, modCatalog],
  );
  const wfLike = isWarframeLike(build.equipment_type);
  const wpnLike = isWeaponLike(build.equipment_type);
  const isCompanion = build.equipment_type === 'companion';

  const warframe = wfLike && equipmentRow ? (equipmentRow as unknown as Warframe) : null;
  const weapon = wpnLike && equipmentRow ? (equipmentRow as unknown as Weapon) : null;

  const shardBonuses = useMemo(
    () =>
      build.equipment_type === 'warframe'
        ? extractArchonShardBonuses(build.shardSlots, undefined)
        : {},
    [build.equipment_type, build.shardSlots],
  );

  const wfCalc = useMemo(() => {
    if (!warframe || !slots.length) return null;
    try {
      return calculateWarframeStats(warframe, slots, shardBonuses);
    } catch {
      return null;
    }
  }, [warframe, slots, shardBonuses]);

  const wpnCalc = useMemo(() => {
    if (!weapon || !slots.length) return null;
    try {
      return calculateWeaponDps(weapon, slots, build.valenceBonus ?? null);
    } catch {
      return null;
    }
  }, [weapon, slots, build.valenceBonus]);

  const abilityNames = useMemo(() => {
    if (!warframe?.abilities || isCompanion) return [] as string[];
    try {
      const parsed = JSON.parse(String(warframe.abilities)) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((a) =>
          a != null && typeof a === 'object' && 'name' in a
            ? String((a as { name?: string }).name)
            : '',
        )
        .filter(Boolean);
    } catch {
      return [];
    }
  }, [warframe, isCompanion]);

  return (
    <div className="glass-shell flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <div className="bg-glass flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl">
          {build.equipment_image ? (
            <img
              src={build.equipment_image}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <span className="text-muted/50 text-xs">?</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-muted mb-0.5 text-[10px] font-semibold tracking-wider uppercase">
            {slotLabel}
          </div>
          <div className="text-foreground truncate text-sm font-semibold">{build.name}</div>
          <div className="text-muted truncate text-xs">{build.equipment_name}</div>
        </div>
      </div>

      {wfCalc && isCompanion ? (
        <dl className="text-muted grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt>Health</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.health.modded.toFixed(0)}
          </dd>
          <dt>Shield</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.shield.modded.toFixed(0)}
          </dd>
          <dt>Armor</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.armor.modded.toFixed(0)}
          </dd>
          <dt>Energy</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.energy.modded.toFixed(0)}
          </dd>
        </dl>
      ) : null}

      {wfCalc && !isCompanion ? (
        <dl className="text-muted grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt>Duration</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.abilityDuration.modded.toFixed(0)}%
          </dd>
          <dt>Efficiency</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.abilityEfficiency.modded.toFixed(0)}%
          </dd>
          <dt>Range</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.abilityRange.modded.toFixed(0)}%
          </dd>
          <dt>Strength</dt>
          <dd className="text-foreground text-right font-medium">
            {wfCalc.abilityStrength.modded.toFixed(0)}%
          </dd>
        </dl>
      ) : null}

      {abilityNames.length > 0 ? (
        <div className="text-muted text-[11px]">
          <span className="text-foreground/90 font-semibold">Abilities: </span>
          {abilityNames.join(' · ')}
        </div>
      ) : null}

      {wpnCalc ? (
        <dl className="text-muted grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt>Burst DPS</dt>
          <dd className="text-foreground text-right font-medium">{wpnCalc.burstDps.toFixed(0)}</dd>
          <dt>Sustained DPS</dt>
          <dd className="text-foreground text-right font-medium">
            {wpnCalc.sustainedDps.toFixed(0)}
          </dd>
          <dt>Total damage (modded)</dt>
          <dd className="text-foreground text-right font-medium">
            {wpnCalc.modded.totalDamage.toFixed(0)}
          </dd>
        </dl>
      ) : null}

      {!wfCalc && !wpnCalc ? (
        <p className="text-muted/70 text-[11px]">
          Open the build for full mod breakdown
          {!equipmentRow ? ' (equipment data still loading).' : '.'}
        </p>
      ) : null}

      <button
        type="button"
        className="btn btn-accent btn-sm mt-auto self-start"
        onClick={() => navigate(buildHref)}
      >
        Open build
      </button>
    </div>
  );
}

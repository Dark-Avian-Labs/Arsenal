import { apiFetch, Button, Modal } from '@dark-avian-labs/ui';
import {
  cycleTriFilter,
  matchesTriFilter,
  triFilterState,
  type TriFilterMap,
} from '@dark-avian-labs/wor-assets/triFilter';
import {
  CLASS_DISPLAY_NAMES,
  FACTION_DISPLAY_NAMES,
  FACTIONS,
  FILTER_STAR_RARITY_LABELS,
  FILTER_STAR_RATINGS,
  GEAR_SLOTS,
  HERO_CLASSES,
  gearSetBadgeSrc,
  type GearSlot,
} from '@shared/catalog';
import { computeFinalStats, type FinalStats } from '@shared/formulas';
import { loadoutStatBag } from '@shared/pieceStats';
import { SET_BY_KEY } from '@shared/sets';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { FilterIconButton } from '../../components/ui/FilterIconButton';
import { FieldSelect } from './FieldSelect';
import { AnchoredHover, GearTile, type GearView } from './GearTile';
import {
  ArtifactPortrait,
  GearPieceCard,
  LOADOUT_LEFT_SLOTS,
  LOADOUT_RIGHT_SLOTS,
  OutfitStatsList,
  gearToPieceInput,
  heroBase,
} from './tabShared';
import type { ArtifactView, HeroRow } from './types';
import { STAR_ICONS, WorIcon, classIconSrc, factionIconSrc, renderStars } from './worIcons';

function dominantSet(
  loadout: Partial<Record<GearSlot, GearView>> | undefined,
  side: 'left' | 'right',
): { key: string; name: string } | null {
  const counts = new Map<string, number>();
  for (const slot of GEAR_SLOTS) {
    const key = loadout?.[slot]?.set_key;
    const def = key ? SET_BY_KEY[key] : undefined;
    if (!key || def?.side !== side) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  if (!best) return null;
  return { key: best, name: SET_BY_KEY[best]?.name ?? best };
}

function EquipmentCard({
  src,
  stars,
  leftSet,
  rightSet,
}: {
  src: string | null;
  stars: ReactNode;
  leftSet: { key: string; name: string } | null;
  rightSet: { key: string; name: string } | null;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(!src);
  useLayoutEffect(() => {
    const img = ref.current;
    if (!src || (img?.complete && img.naturalWidth === 0)) setFailed(true);
  }, [src]);
  return (
    <div className={`equipment-card${failed ? ' is-empty' : ''}`}>
      {!failed && src ? (
        <img
          ref={ref}
          className="equipment-card__art"
          src={src}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : null}
      {leftSet ? (
        <img
          className="equipment-card__set is-left"
          src={gearSetBadgeSrc(leftSet.key)}
          alt=""
          title={leftSet.name}
        />
      ) : null}
      {rightSet ? (
        <img
          className="equipment-card__set is-right"
          src={gearSetBadgeSrc(rightSet.key)}
          alt=""
          title={rightSet.name}
        />
      ) : null}
      <span className="equipment-card__stars">{stars}</span>
    </div>
  );
}

function HeroPortrait({ src, className }: { src: string | null; className: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);
  if (!src || failed) return null;
  return <img ref={ref} className={className} src={src} alt="" onError={() => setFailed(true)} />;
}

export function EquipmentTab({
  heroes,
  gear,
  artifacts,
  onSaved,
}: {
  heroes: HeroRow[];
  gear: GearView[];
  artifacts: ArtifactView[];
  onSaved: () => Promise<void>;
}) {
  const [classFilter, setClassFilter] = useState<TriFilterMap>({});
  const [factionFilter, setFactionFilter] = useState<TriFilterMap>({});
  const [rarityFilter, setRarityFilter] = useState<TriFilterMap>({});
  const [selectedHero, setSelectedHero] = useState<HeroRow | null>(null);
  const [heroLoadout, setHeroLoadout] = useState<{
    gear: GearView[];
    artifact: ArtifactView | null;
    stats: FinalStats | null;
  } | null>(null);
  const [selectedArtifactId, setSelectedArtifactId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const equippedHeroes = useMemo(() => {
    const slugs = new Set(gear.map((piece) => piece.equipped_hero_slug).filter(Boolean));
    return heroes.filter((hero) => slugs.has(hero.slug));
  }, [gear, heroes]);

  const filteredEquipmentHeroes = useMemo(
    () =>
      equippedHeroes.filter((hero) => {
        if (!matchesTriFilter(hero.class, classFilter)) return false;
        if (
          !matchesTriFilter(hero.faction, factionFilter) &&
          !matchesTriFilter(hero.faction_secondary, factionFilter)
        ) {
          return false;
        }
        if (!matchesTriFilter(String(hero.star_rating), rarityFilter)) return false;
        return true;
      }),
    [classFilter, equippedHeroes, factionFilter, rarityFilter],
  );

  const equippedGearByHero = useMemo(() => {
    const map = new Map<string, Partial<Record<GearSlot, GearView>>>();
    for (const piece of gear) {
      const slug = piece.equipped_hero_slug;
      if (!slug) continue;
      const slots = map.get(slug) ?? {};
      slots[piece.slot] = piece;
      map.set(slug, slots);
    }
    return map;
  }, [gear]);

  const equippedArtifactByHero = useMemo(() => {
    const map = new Map<string, ArtifactView>();
    for (const row of artifacts) {
      if (!row.equipped_hero_slug) continue;
      map.set(row.equipped_hero_slug, row);
    }
    return map;
  }, [artifacts]);

  const artifactsByName = useMemo(
    () =>
      artifacts
        .slice()
        .sort(
          (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id,
        ),
    [artifacts],
  );

  const selectedEquipmentArtifact = useMemo(() => {
    if (selectedArtifactId === '') return null;
    return artifacts.find((row) => String(row.id) === selectedArtifactId) ?? null;
  }, [artifacts, selectedArtifactId]);

  const previewLoadoutStats = useMemo(() => {
    if (!selectedHero || !heroLoadout) return null;
    return computeFinalStats(
      heroBase(selectedHero),
      loadoutStatBag(heroLoadout.gear.map(gearToPieceInput), selectedEquipmentArtifact),
    );
  }, [heroLoadout, selectedEquipmentArtifact, selectedHero]);

  async function openHero(hero: HeroRow): Promise<void> {
    setSelectedHero(hero);
    setHeroLoadout(null);
    setSelectedArtifactId('');
    setFormError(null);
    const response = await apiFetch(`/api/heroes/${hero.slug}/loadout`);
    if (!response.ok) return;
    const body = (await response.json()) as {
      gear?: GearView[];
      artifact?: ArtifactView | null;
      stats?: FinalStats | null;
    };
    const artifact = body.artifact ?? null;
    setHeroLoadout({ gear: body.gear ?? [], artifact, stats: body.stats ?? null });
    setSelectedArtifactId(artifact ? String(artifact.id) : '');
  }

  async function saveHeroArtifact(): Promise<void> {
    if (!selectedHero) return;
    const response = await apiFetch(`/api/heroes/${selectedHero.slug}/artifact`, {
      method: 'PATCH',
      body: JSON.stringify({
        artifact_id: selectedArtifactId === '' ? null : Number(selectedArtifactId),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setFormError(body?.error ?? 'Could not save artifact');
      return;
    }
    setSelectedHero(null);
    await onSaved();
  }

  return (
    <>
      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">Class:</span>
          {HERO_CLASSES.map((heroClass) => (
            <FilterIconButton
              key={heroClass}
              state={triFilterState(classFilter, heroClass)}
              label={CLASS_DISPLAY_NAMES[heroClass]}
              onClick={() => setClassFilter((previous) => cycleTriFilter(previous, heroClass))}
            >
              <WorIcon
                className="invert-on-light"
                src={classIconSrc(heroClass)}
                alt={CLASS_DISPLAY_NAMES[heroClass]}
                size={24}
              />
            </FilterIconButton>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">Rarity:</span>
          {FILTER_STAR_RATINGS.map((stars) => {
            const iconSrc = STAR_ICONS[`star${stars}`];
            return (
              <FilterIconButton
                key={stars}
                state={triFilterState(rarityFilter, String(stars))}
                label={`${FILTER_STAR_RARITY_LABELS[stars]} rarity`}
                onClick={() =>
                  setRarityFilter((previous) => cycleTriFilter(previous, String(stars)))
                }
              >
                {iconSrc ? (
                  <img src={iconSrc} alt={`${stars} star`} width={24} height={24} />
                ) : (
                  <span aria-hidden="true">{stars}★</span>
                )}
              </FilterIconButton>
            );
          })}
        </div>
        <div className="filter-group">
          <span className="filter-label">Faction:</span>
          {FACTIONS.filter((faction) => faction !== 'unaffiliated').map((faction) => (
            <FilterIconButton
              key={faction}
              state={triFilterState(factionFilter, faction)}
              label={FACTION_DISPLAY_NAMES[faction]}
              onClick={() => setFactionFilter((previous) => cycleTriFilter(previous, faction))}
            >
              <WorIcon
                src={factionIconSrc(faction)}
                alt={FACTION_DISPLAY_NAMES[faction]}
                size={24}
              />
            </FilterIconButton>
          ))}
        </div>
      </div>
      <div className="equipment-wall">
        {filteredEquipmentHeroes.map((hero) => {
          const loadout = equippedGearByHero.get(hero.slug);
          const artifact = equippedArtifactByHero.get(hero.slug);
          return (
            <button
              key={hero.slug}
              type="button"
              className="equipment-figure"
              onClick={() => void openHero(hero)}
            >
              <AnchoredHover
                captureClick={false}
                className="equipment-figure__body"
                card={
                  <div className="equipment-hover">
                    {GEAR_SLOTS.map((slot) => {
                      const piece = loadout?.[slot];
                      if (!piece) return null;
                      return (
                        <GearTile
                          key={slot}
                          gear={piece}
                          size={48}
                          showEquipped={false}
                          hover={false}
                        />
                      );
                    })}
                    {artifact ? (
                      <ArtifactPortrait
                        src={artifact.portrait_path}
                        size={48}
                        title={artifact.name}
                        promotion={artifact.promotion}
                        rarity={artifact.rarity}
                        starRating={artifact.star_rating}
                      />
                    ) : null}
                  </div>
                }
              >
                <EquipmentCard
                  src={hero.portrait_path}
                  stars={renderStars(hero.star_rating, hero.is_lord ? 'star6' : undefined)}
                  leftSet={dominantSet(loadout, 'left')}
                  rightSet={dominantSet(loadout, 'right')}
                />
                <span className="equipment-figure__name">{hero.name}</span>
              </AnchoredHover>
            </button>
          );
        })}
        {filteredEquipmentHeroes.length === 0 ? (
          <p className="text-muted text-sm">
            No saved loadouts yet. Calculate one on the Outfit tab.
          </p>
        ) : null}
      </div>
      <Modal
        open={selectedHero != null}
        onClose={() => setSelectedHero(null)}
        className="glass-modal-surface max-w-5xl"
      >
        {selectedHero ? (
          <>
            <div className="equipment-doll">
              <div className="equipment-loadout__col">
                {LOADOUT_LEFT_SLOTS.map((slot) => (
                  <GearPieceCard
                    key={slot}
                    slot={slot}
                    piece={heroLoadout?.gear.find((row) => row.slot === slot)}
                  />
                ))}
              </div>
              <div className="equipment-doll__figure">
                <HeroPortrait
                  key={selectedHero.slug}
                  className="equipment-doll__portrait"
                  src={selectedHero.portrait_path}
                />
                <h2>{selectedHero.name}</h2>
                <div className="equipment-loadout-stats glass-surface w-full text-left">
                  {previewLoadoutStats ? (
                    <OutfitStatsList stats={previewLoadoutStats} hero={selectedHero} />
                  ) : (
                    <p className="text-muted text-sm">No stats yet.</p>
                  )}
                </div>
                <div className="gear-piece-card glass-surface w-full text-left">
                  <div className="gear-piece-card__head">
                    {selectedEquipmentArtifact ? (
                      <ArtifactPortrait
                        src={selectedEquipmentArtifact.portrait_path}
                        size={72}
                        promotion={selectedEquipmentArtifact.promotion}
                        rarity={selectedEquipmentArtifact.rarity}
                        starRating={selectedEquipmentArtifact.star_rating}
                      />
                    ) : (
                      <div
                        className="gear-tile gear-tile--empty"
                        style={{ width: 72, height: 72 }}
                        title="Artifact"
                      />
                    )}
                    <div className="gear-piece-card__meta min-w-0 flex-1">
                      <div className="gear-piece-card__slot">Artifact</div>
                      <FieldSelect
                        className="mt-1 min-w-0"
                        value={selectedArtifactId}
                        options={[
                          { value: '', label: 'None' },
                          ...artifactsByName.map((row) => ({
                            value: String(row.id),
                            label:
                              row.equipped_hero_slug && row.equipped_hero_slug !== selectedHero.slug
                                ? `${row.name} · ${row.equipped_hero_name ?? row.equipped_hero_slug}`
                                : row.name,
                            iconSrc: row.portrait_path ?? undefined,
                          })),
                        ]}
                        onChange={setSelectedArtifactId}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="equipment-loadout__col">
                {LOADOUT_RIGHT_SLOTS.map((slot) => (
                  <GearPieceCard
                    key={slot}
                    slot={slot}
                    piece={heroLoadout?.gear.find((row) => row.slot === slot)}
                  />
                ))}
              </div>
            </div>
            {formError ? (
              <p className="mt-3 text-sm text-[var(--color-danger)]">{formError}</p>
            ) : null}
            <div className="modal-actions">
              <Button variant="cancel" onClick={() => setSelectedHero(null)}>
                Close
              </Button>
              <Button variant="accent" onClick={() => void saveHeroArtifact()}>
                Save
              </Button>
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

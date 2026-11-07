import {
  cycleTriFilter,
  matchesTriFilter,
  triFilterState,
  type TriFilterMap,
} from '@dark-avian-labs/wor-assets/triFilter';
import {
  GEAR_SLOTS,
  GEAR_STAT_LABELS,
  SLOT_LABELS,
  formatMainStatText,
  gearEmptySlotSrc,
  gearSetBadgeSrc,
  outOfRangeGearLabels,
} from '@shared/catalog';
import { GEAR_RANKS, KEEP_RULES, rateGear } from '@shared/gearRating';
import { compareInventoryGear } from '@shared/gearSort';
import { ALL_SETS, SET_BY_KEY, setsSortedByTier } from '@shared/sets';
import { useMemo, useState } from 'react';

import { FilterIconButton } from '../../components/ui/FilterIconButton';
import { FieldSelect } from './FieldSelect';
import { GearMainStat, GearTile, type GearView } from './GearTile';

export function GearTab({
  gear,
  onAdd,
  onEdit,
}: {
  gear: GearView[];
  onAdd: () => void;
  onEdit: (piece: GearView) => void;
}) {
  const [slotFilter, setSlotFilter] = useState<TriFilterMap>({});
  const [setFilter, setSetFilter] = useState('');
  const [mainFilter, setMainFilter] = useState('');
  const [subFilter, setSubFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');

  const filteredGear = useMemo(
    () =>
      gear
        .map((piece) => ({ piece, rating: rateGear(piece) }))
        .filter(({ piece, rating }) => {
          if (!matchesTriFilter(piece.slot, slotFilter)) return false;
          if (setFilter && piece.set_key !== setFilter) return false;
          if (mainFilter && piece.main_stat !== mainFilter) return false;
          if (subFilter) {
            const stats = [piece.sub1_stat, piece.sub2_stat, piece.sub3_stat, piece.sub4_stat];
            if (!stats.includes(subFilter as GearView['main_stat'])) return false;
          }
          if (ratingFilter && rating.rank !== ratingFilter) return false;
          if (ruleFilter === 'none' && rating.ruleName != null) return false;
          if (ruleFilter && ruleFilter !== 'none' && rating.ruleName !== ruleFilter) return false;
          return true;
        })
        .sort((left, right) => compareInventoryGear(left.piece, right.piece)),
    [gear, mainFilter, ratingFilter, ruleFilter, setFilter, slotFilter, subFilter],
  );

  return (
    <>
      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">Type:</span>
          {GEAR_SLOTS.map((slot) => (
            <FilterIconButton
              key={slot}
              state={triFilterState(slotFilter, slot)}
              label={SLOT_LABELS[slot]}
              onClick={() => setSlotFilter((previous) => cycleTriFilter(previous, slot))}
            >
              <img src={gearEmptySlotSrc(slot)} alt="" />
            </FilterIconButton>
          ))}
        </div>
        <FieldSelect
          className="min-w-[12rem]"
          label="Set"
          inline
          value={setFilter}
          options={[
            { value: '', label: 'All sets' },
            ...setsSortedByTier(ALL_SETS).map((set) => ({
              value: set.key,
              label: set.name,
              iconSrc: gearSetBadgeSrc(set.key),
            })),
          ]}
          onChange={setSetFilter}
        />
        <FieldSelect
          className="min-w-[12rem]"
          label="Main"
          inline
          value={mainFilter}
          options={[
            { value: '', label: 'Any main' },
            ...Object.entries(GEAR_STAT_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          onChange={setMainFilter}
        />
        <FieldSelect
          className="min-w-[12rem]"
          label="Sub"
          inline
          value={subFilter}
          options={[
            { value: '', label: 'Any sub' },
            ...Object.entries(GEAR_STAT_LABELS).map(([value, label]) => ({ value, label })),
          ]}
          onChange={setSubFilter}
        />
        <FieldSelect
          className="min-w-[8rem]"
          label="Rating"
          inline
          value={ratingFilter}
          options={[
            { value: '', label: 'All' },
            ...GEAR_RANKS.map((rank) => ({ value: rank, label: rank })),
          ]}
          onChange={setRatingFilter}
        />
        <FieldSelect
          className="min-w-[16rem]"
          label="Rule"
          inline
          value={ruleFilter}
          options={[
            { value: '', label: 'All rules' },
            { value: 'none', label: 'No rule' },
            ...KEEP_RULES.map((rule) => ({ value: rule.name, label: rule.name })),
          ]}
          onChange={setRuleFilter}
        />
        <div className="stats-bar-actions ml-auto">
          <button
            type="button"
            className="stats-bar-toggle"
            onClick={() => {
              onAdd();
            }}
          >
            + Add
          </button>
        </div>
      </div>
      <div className="gear-stamps">
        {filteredGear.map(({ piece, rating }) => {
          const setName = SET_BY_KEY[piece.set_key]?.name ?? piece.set_key;
          const mainLabel = formatMainStatText(piece.main_stat, piece.main_value, piece.main_bonus);
          const illegalLabels = outOfRangeGearLabels(piece);
          return (
            <button
              key={piece.id}
              type="button"
              className={`gear-stamp${illegalLabels.length > 0 ? ' gear-stamp--illegal' : ''}`}
              title={
                illegalLabels.length > 0 ? `Out of range: ${illegalLabels.join(', ')}` : mainLabel
              }
              onClick={() => {
                onEdit(piece);
              }}
            >
              <span className="gear-stamp__face">
                <GearTile gear={piece} size={88} showEquipped captureClick={false} />
                <span className="gear-rating__rank gear-stamp__rank" data-rank={rating.rank}>
                  {rating.rank}
                </span>
              </span>
              <span className="gear-stamp__caption gear-stamp__set" title={setName}>
                {setName}
              </span>
              <span className="gear-stamp__caption gear-stamp__main" title={mainLabel}>
                <GearMainStat
                  stat={piece.main_stat}
                  value={piece.main_value}
                  bonus={piece.main_bonus}
                />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

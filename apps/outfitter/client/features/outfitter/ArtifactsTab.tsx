import { CLASS_DISPLAY_NAMES, outOfRangeArtifactLabels } from '@shared/catalog';
import { useMemo } from 'react';

import { AnchoredHover, WearerMark } from './GearTile';
import { ArtifactPortrait, artifactStatLines } from './tabShared';
import type { ArtifactView } from './types';
import { classIconSrc } from './worIcons';

function ArtifactMark({ row }: { row: ArtifactView }) {
  if (row.exclusive_hero_portrait) {
    return (
      <img
        className="gear-tile__overlay gear-tile__overlay--tl"
        src={row.exclusive_hero_portrait}
        alt={row.exclusive_hero_name ?? 'Exclusive'}
      />
    );
  }
  const classKey = row.class;
  const src = classKey ? classIconSrc(classKey) : undefined;
  if (!classKey || !src) return null;
  return (
    <img
      className="gear-tile__overlay gear-tile__overlay--tl gear-tile__overlay--class invert-on-light"
      src={src}
      alt={CLASS_DISPLAY_NAMES[classKey] ?? classKey}
    />
  );
}

export function ArtifactsTab({
  artifacts,
  onAdd,
  onEdit,
}: {
  artifacts: ArtifactView[];
  onAdd: () => void;
  onEdit: (row: ArtifactView) => void;
}) {
  const artifactsByName = useMemo(
    () =>
      artifacts
        .slice()
        .sort(
          (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id,
        ),
    [artifacts],
  );

  return (
    <>
      <div className="filter-bar">
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
      <div className="artifact-stamps">
        {artifactsByName.map((row) => {
          const illegalLabels = outOfRangeArtifactLabels(row);
          return (
            <button
              key={row.id}
              type="button"
              className={`artifact-stamp${illegalLabels.length > 0 ? ' artifact-stamp--illegal' : ''}`}
              title={
                illegalLabels.length > 0 ? `Out of range: ${illegalLabels.join(', ')}` : row.name
              }
              onClick={() => {
                onEdit(row);
              }}
            >
              <AnchoredHover
                captureClick={false}
                className="artifact-stamp__body"
                card={
                  <>
                    <div className="gear-hover-card__icon">
                      <ArtifactPortrait
                        src={row.portrait_path}
                        size={72}
                        promotion={row.promotion}
                        rarity={row.rarity}
                        starRating={row.star_rating}
                        mark={<ArtifactMark row={row} />}
                      />
                      {row.equipped_hero_name || row.equipped_hero_portrait ? (
                        <WearerMark
                          label="Equipped on"
                          name={row.equipped_hero_name}
                          portrait={row.equipped_hero_portrait}
                        />
                      ) : null}
                    </div>
                    <div className="artifact-stat-lines">
                      {artifactStatLines(row).map((line) => (
                        <span
                          key={line.key}
                          className={
                            line.illegal ? 'artifact-stat-lines__line is-illegal' : undefined
                          }
                        >
                          {line.text}
                        </span>
                      ))}
                    </div>
                  </>
                }
              >
                <ArtifactPortrait
                  src={row.portrait_path}
                  size={96}
                  title={row.name}
                  promotion={row.promotion}
                  rarity={row.rarity}
                  starRating={row.star_rating}
                  mark={<ArtifactMark row={row} />}
                />
                <span className="artifact-stamp__name" title={row.name}>
                  {row.name}
                </span>
              </AnchoredHover>
            </button>
          );
        })}
        {artifacts.length === 0 ? (
          <p className="text-muted text-sm">
            No artifacts yet. Add one, or Ctrl+V a screenshot in the add dialog.
          </p>
        ) : null}
      </div>
    </>
  );
}

import {
  type ArcaneCardLayout,
  type ArcaneRarity,
  DEFAULT_ARCANE_LAYOUT,
  getArcaneAsset,
} from './cardLayout';

export interface ArcaneCardPreviewProps {
  layout?: ArcaneCardLayout;
  rarity?: ArcaneRarity;
  arcaneArt: string;
  arcaneName: string;
  rank: number;
  maxRank: number;
  showGuides?: boolean;
  showOutlines?: boolean;
  collapsed?: boolean;
}

export function ArcaneCardPreview({
  layout: layoutProp,
  rarity = 'empty',
  arcaneArt,
  arcaneName,
  rank,
  maxRank,
  showGuides = false,
  showOutlines = false,
  collapsed = false,
}: ArcaneCardPreviewProps) {
  const L = layoutProp ?? DEFAULT_ARCANE_LAYOUT;
  const s = L.scale;
  const h = collapsed ? L.collapsedHeight : L.cardHeight;

  const bgSrc = getArcaneAsset(rarity);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: L.cardWidth * s,
        height: h * s,
        outline: showOutlines
          ? '1px dashed color-mix(in srgb, var(--color-foreground) 20%, transparent)'
          : 'none',
        textShadow: '0 1px 3px rgba(0,0,0,1), 0 2px 8px rgba(0,0,0,0.6)',
      }}
    >
      <div className="absolute inset-0" style={{ transform: `translateY(${L.cardOffsetY * s}px)` }}>
        <img
          src={bgSrc}
          alt="bg"
          className="absolute left-1/2"
          style={{
            zIndex: 0,
            transform: 'translateX(-50%)',
            marginLeft: L.bgOffsetX * s,
            top: L.bgOffsetY * s,
            width: L.bgWidth * s,
            height: L.bgHeight * s,
          }}
          draggable={false}
        />

        {arcaneArt && (
          <div
            className="absolute overflow-hidden"
            style={{
              zIndex: 1,
              left: L.artOffsetX * s,
              top: L.artOffsetY * s,
              width: L.artWidth * s,
              height: (collapsed ? L.collapsedArtHeight : L.artHeight) * s,
              outline: showOutlines ? '1px dashed rgba(0,200,255,0.4)' : 'none',
            }}
          >
            <img
              src={arcaneArt}
              alt="art"
              className="object-cover"
              style={{
                width: L.artWidth * s,
                height: L.artHeight * s,
                filter: collapsed ? 'grayscale(0.8) brightness(0.4)' : 'none',
              }}
              draggable={false}
            />
          </div>
        )}

        <div
          className="text-foreground absolute left-1/2 -translate-x-1/2 text-center"
          style={{
            zIndex: 2,
            top: (collapsed ? L.collapsedNameOffsetY : L.nameOffsetY) * s,
            width: (L.cardWidth - L.textPaddingX * 2) * s,
            fontSize: (collapsed ? L.collapsedNameFontSize : L.nameFontSize) * s,
            fontWeight: 500,
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          }}
        >
          {arcaneName}
        </div>

        <div
          className="absolute flex items-center justify-center"
          style={{
            zIndex: 2,
            left: 0,
            width: L.cardWidth * s,
            top: (collapsed ? L.collapsedDiamondOffsetY : L.diamondOffsetY) * s,
            gap: (collapsed ? L.collapsedDiamondSize * 0.3 : L.diamondGap) * s,
          }}
        >
          {Array.from({ length: maxRank }, (_, i) => {
            const dSize = collapsed ? L.collapsedDiamondSize : L.diamondSize;
            const filled = i < rank;
            return (
              <span
                key={i}
                style={{
                  fontSize: dSize * s,
                  lineHeight: 1,
                  color: filled
                    ? 'var(--color-primary-100)'
                    : 'color-mix(in srgb, var(--color-foreground) 20%, transparent)',
                  textShadow: filled
                    ? '0 0 4px color-mix(in srgb, var(--color-primary-100) 60%, transparent)'
                    : 'none',
                }}
              >
                {filled ? '\u25C6' : '\u25C7'}
              </span>
            );
          })}
        </div>
      </div>

      {showGuides && (
        <>
          <div
            className="absolute top-0 left-1/2 h-full"
            style={{ width: 1, background: 'rgba(255,0,0,0.2)' }}
          />
          <div
            className="absolute top-1/2 left-0 w-full"
            style={{ height: 1, background: 'rgba(255,0,0,0.2)' }}
          />
        </>
      )}
    </div>
  );
}

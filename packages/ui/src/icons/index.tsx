import type { SVGAttributes } from 'react';

import { ICONS, type IconName } from './icons.generated';

export type { IconName };

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

export function MaterialSymbol({
  name,
  filled = false,
  className,
  title,
  ...rest
}: {
  name: IconName;
  filled?: boolean;
  title?: string;
} & Omit<SVGAttributes<SVGSVGElement>, 'children' | 'name'>) {
  const icon = ICONS[name];
  if (!icon) {
    if (import.meta.env.DEV) throw new Error(`Unknown icon "${name}". Run pnpm icons:sync.`);
    return null;
  }
  return (
    <svg
      viewBox="0 -960 960 960"
      width="1em"
      height="1em"
      fill="currentColor"
      className={['material-symbol', className].filter(Boolean).join(' ')}
      {...rest}
      {...(title ? { title } : null)}
      aria-hidden="true"
    >
      <path d={filled ? icon.fill : icon.d} />
    </svg>
  );
}

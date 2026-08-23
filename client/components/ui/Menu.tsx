import type { ReactNode } from 'react';

interface MenuProps {
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * Generic glass popup panel. Intentionally has no ARIA `menu` role: that role
 * requires `menuitem` children and full arrow-key navigation, and this panel
 * hosts arbitrary content (selectors, buttons). Pair the trigger with
 * `aria-expanded` and `aria-controls`.
 */
export function Menu({ children, className, id }: MenuProps) {
  const classes = ['user-menu', 'glass-surface'];
  if (className) {
    classes.push(className);
  }
  return (
    <div id={id} className={classes.join(' ')}>
      {children}
    </div>
  );
}

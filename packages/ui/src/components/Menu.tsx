import type { ReactNode } from 'react';

interface MenuProps {
  children: ReactNode;
  className?: string;
  id?: string;
  baseClass?: string;
}

export function Menu({ children, className, id, baseClass = 'user-menu' }: MenuProps) {
  const classes = [baseClass, 'glass-surface'];
  if (className) {
    classes.push(className);
  }
  return (
    <div id={id} className={classes.join(' ')}>
      {children}
    </div>
  );
}

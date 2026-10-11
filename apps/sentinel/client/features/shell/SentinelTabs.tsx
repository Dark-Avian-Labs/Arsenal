import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { APP_PATHS } from '../../app/paths';

export type SentinelTab = 'fleet' | 'forgejo' | 'app';

type SentinelTabsProps = {
  active: SentinelTab;
  appLabel?: string;
  trailing?: ReactNode;
};

function TabLink({ to, label, active }: { to: string; label: string; active: boolean }): ReactNode {
  if (active) {
    return (
      <button type="button" className="tab active" role="tab" aria-selected="true">
        {label}
      </button>
    );
  }
  return (
    <Link to={to} className="tab no-underline" role="tab" aria-selected="false">
      {label}
    </Link>
  );
}

export function SentinelTabs({ active, appLabel, trailing }: SentinelTabsProps) {
  return (
    <div className="tabs items-center">
      <div className="flex min-w-0 flex-wrap gap-1" role="tablist" aria-label="Sentinel">
        <TabLink to={APP_PATHS.home} label="Fleet" active={active === 'fleet'} />
        <TabLink to={APP_PATHS.forgejo} label="Forgejo" active={active === 'forgejo'} />
        {active === 'app' ? (
          <button
            type="button"
            className="tab active max-w-[16rem] truncate"
            role="tab"
            aria-selected="true"
          >
            {appLabel || 'App'}
          </button>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}

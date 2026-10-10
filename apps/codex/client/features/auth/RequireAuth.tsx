import { Show } from '@clerk/react';
import { safeAuthRedirectPath } from '@dark-avian-labs/ui';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';

import { AccountRequiredPage } from './AccountRequiredPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const returnTo =
    safeAuthRedirectPath(`${location.pathname}${location.search}${location.hash}`) ?? '/';

  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <AccountRequiredPage returnTo={returnTo} />
      </Show>
    </>
  );
}

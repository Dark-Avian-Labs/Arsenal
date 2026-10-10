import { Show } from '@clerk/react';
import { Navigate } from 'react-router';

import { APP_PATHS } from '../../app/paths';
import { AccountRequiredPage } from './AccountRequiredPage';

export function CodexLandingPage() {
  return (
    <>
      <Show when="signed-in">
        <Navigate to={APP_PATHS.selector} replace />
      </Show>
      <Show when="signed-out">
        <AccountRequiredPage />
      </Show>
    </>
  );
}

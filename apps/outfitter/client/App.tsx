import { ClerkProvider, useUser } from '@clerk/react';
import { AppShellProvider, AuthProvider, DisabledAuthProvider } from '@dark-avian-labs/ui';
import { useCallback, type ReactNode } from 'react';
import { Outlet } from 'react-router';

import {
  APP_DISPLAY_NAME,
  APP_ID,
  APP_VERSION,
  CLERK_ENABLED,
  CLERK_PUBLISHABLE_KEY,
  LEGAL_ENTITY_NAME,
  LEGAL_PAGE_URL,
} from './app/config';
import { APP_PATHS } from './app/paths';
import { clerkUserIsOutfitterAdmin } from './features/auth/outfitterAdmin';

const shell = {
  appName: APP_DISPLAY_NAME,
  appId: APP_ID,
  version: APP_VERSION,
  clerkEnabled: CLERK_ENABLED,
  legalPageUrl: LEGAL_PAGE_URL,
  legalEntityName: LEGAL_ENTITY_NAME,
  searchPlaceholder: 'Search',
  paths: { home: APP_PATHS.home, signIn: APP_PATHS.signIn, signUp: APP_PATHS.signUp },
};

function OutfitterAuth({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const resolveAdmin = useCallback(
    (apiIsAdmin: boolean) => apiIsAdmin || clerkUserIsOutfitterAdmin(user?.publicMetadata),
    [user?.publicMetadata],
  );
  return <AuthProvider resolveAdmin={resolveAdmin}>{children}</AuthProvider>;
}

export function App() {
  const page = !CLERK_ENABLED ? (
    <DisabledAuthProvider>
      <Outlet />
    </DisabledAuthProvider>
  ) : (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl={APP_PATHS.signIn}
      signUpUrl={APP_PATHS.signUp}
      afterSignOutUrl={APP_PATHS.home}
    >
      <OutfitterAuth>
        <Outlet />
      </OutfitterAuth>
    </ClerkProvider>
  );

  return <AppShellProvider value={shell}>{page}</AppShellProvider>;
}

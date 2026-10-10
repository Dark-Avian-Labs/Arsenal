import { ClerkProvider } from '@clerk/react';
import { AppShellProvider, AuthProvider, DisabledAuthProvider } from '@dark-avian-labs/ui';
import { Outlet } from 'react-router';

import {
  APP_DISPLAY_NAME,
  APP_ID,
  APP_VERSION,
  CLERK_ENABLED,
  CLERK_PUBLISHABLE_KEY,
  LEGAL_ENTITY_NAME,
  LEGAL_PAGE_URL,
  SEARCH_PLACEHOLDER,
} from './app/config';
import { APP_PATHS } from './app/paths';

const shell = {
  appName: APP_DISPLAY_NAME,
  appId: APP_ID,
  version: APP_VERSION,
  clerkEnabled: CLERK_ENABLED,
  legalPageUrl: LEGAL_PAGE_URL,
  legalEntityName: LEGAL_ENTITY_NAME,
  searchPlaceholder: SEARCH_PLACEHOLDER,
  paths: APP_PATHS,
};

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
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </ClerkProvider>
  );

  return <AppShellProvider value={shell}>{page}</AppShellProvider>;
}

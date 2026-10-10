import './styles/input.css';
import '@dark-avian-labs/ui/clerk-auth.css';
import './i18n';

import { ClerkProvider } from '@clerk/react';
import {
  AppShellProvider,
  AuthProvider,
  DisabledAuthProvider,
  ThemeProvider,
} from '@dark-avian-labs/ui';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';

import {
  APP_DISPLAY_NAME,
  APP_ID,
  APP_VERSION,
  CLERK_PUBLISHABLE_KEY,
  LEGAL_ENTITY_NAME,
  LEGAL_PAGE_URL,
} from './app/config';
import { APP_PATHS } from './app/paths';
import { router } from './app/routes';

const shell = {
  appName: APP_DISPLAY_NAME,
  appId: APP_ID,
  version: APP_VERSION,
  clerkEnabled: CLERK_PUBLISHABLE_KEY.length > 0,
  legalPageUrl: LEGAL_PAGE_URL,
  legalEntityName: LEGAL_ENTITY_NAME,
  searchPlaceholder: 'Search plans',
  paths: APP_PATHS,
};

function Providers({ children }: { children: ReactNode }) {
  const page = CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl={APP_PATHS.signIn}
      signUpUrl={APP_PATHS.signUp}
      afterSignOutUrl={APP_PATHS.home}
    >
      <AuthProvider>{children}</AuthProvider>
    </ClerkProvider>
  ) : (
    <DisabledAuthProvider>{children}</DisabledAuthProvider>
  );
  return <AppShellProvider value={shell}>{page}</AppShellProvider>;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      appStorageKey="budgetplanner.theme.mode"
      legacyKeys={['bp.theme.mode']}
      legacyUiStyleKeys={['bp.ui.style']}
    >
      <Providers>
        <RouterProvider router={router} />
      </Providers>
    </ThemeProvider>
  </StrictMode>,
);

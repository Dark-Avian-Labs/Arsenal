import { ClerkProvider } from '@clerk/react';
import { AppShellProvider, AuthProvider } from '@dark-avian-labs/ui';
import { Outlet } from 'react-router';

import {
  APP_DISPLAY_NAME,
  APP_ID,
  APP_VERSION,
  LEGAL_ENTITY_NAME,
  LEGAL_PAGE_URL,
} from './app/config';
import { APP_PATHS } from './app/paths';
import { BuildStorageProvider } from './context/BuildStorageContext';
import { CompareProvider } from './context/CompareContext';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? '';

const shell = {
  appName: APP_DISPLAY_NAME,
  appId: APP_ID,
  version: APP_VERSION,
  clerkEnabled: publishableKey.length > 0,
  legalPageUrl: LEGAL_PAGE_URL,
  legalEntityName: LEGAL_ENTITY_NAME,
  searchPlaceholder: 'Search equipment',
  paths: APP_PATHS,
};

export function App() {
  if (!publishableKey) {
    return (
      <AppShellProvider value={shell}>
        <div className="flex min-h-screen items-center justify-center p-6 text-center" role="alert">
          <p className="text-muted text-sm">
            Missing VITE_CLERK_PUBLISHABLE_KEY. Add it to your environment file to enable sign-in.
          </p>
        </div>
      </AppShellProvider>
    );
  }

  return (
    <AppShellProvider value={shell}>
      <ClerkProvider
        publishableKey={publishableKey}
        signInUrl={APP_PATHS.signIn}
        signUpUrl={APP_PATHS.signUp}
        afterSignOutUrl={APP_PATHS.home}
      >
        <AuthProvider>
          <BuildStorageProvider>
            <CompareProvider>
              <Outlet />
            </CompareProvider>
          </BuildStorageProvider>
        </AuthProvider>
      </ClerkProvider>
    </AppShellProvider>
  );
}

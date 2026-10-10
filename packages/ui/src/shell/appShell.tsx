import { createContext, useContext, type ReactNode } from 'react';

export interface AppPaths {
  home: string;
  signIn: string;
  signUp: string;
}

export interface AppShellConfig {
  appName: string;
  appId: string;
  version: string;
  clerkEnabled: boolean;
  legalPageUrl: string;
  legalEntityName: string;
  searchPlaceholder: string;
  paths: AppPaths;
}

const AppShellContext = createContext<AppShellConfig | null>(null);

export function AppShellProvider({
  value,
  children,
}: {
  value: AppShellConfig;
  children: ReactNode;
}) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell(): AppShellConfig {
  const value = useContext(AppShellContext);
  if (!value) {
    throw new Error('AppShellProvider is missing');
  }
  return value;
}

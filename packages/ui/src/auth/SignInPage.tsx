import { SignIn } from '@clerk/react';
import { Navigate, useSearchParams } from 'react-router';

import { buildClerkAppearance, ClerkAuthShell } from '../clerk/index';
import { useAppShell } from '../shell/appShell';
import { useTheme } from '../theme/ThemeContext';
import { buildAuthPagePath, getAuthRedirectUrl } from './authRedirect';

export function SignInPage({
  routing = 'path',
  title = 'Sign in',
  subtitle,
}: {
  routing?: 'path' | 'hash';
  title?: string;
  subtitle?: string;
} = {}) {
  const { appName, clerkEnabled, paths } = useAppShell();
  const { mode } = useTheme();
  const [searchParams] = useSearchParams();
  const redirectUrl = getAuthRedirectUrl(searchParams, paths.home);

  if (!clerkEnabled) {
    return <Navigate to={paths.home} replace />;
  }

  const appearance = buildClerkAppearance(mode);
  const signUpUrl = buildAuthPagePath(paths.signUp, redirectUrl);
  const shellTitle = title;
  const shellSubtitle = subtitle ?? `Access your ${appName} account.`;

  if (routing === 'hash') {
    return (
      <ClerkAuthShell title={shellTitle} subtitle={shellSubtitle}>
        <SignIn
          routing="hash"
          signUpUrl={signUpUrl}
          fallbackRedirectUrl={redirectUrl}
          appearance={appearance}
        />
      </ClerkAuthShell>
    );
  }

  return (
    <ClerkAuthShell title={shellTitle} subtitle={shellSubtitle}>
      <SignIn
        routing="path"
        path={paths.signIn}
        signUpUrl={signUpUrl}
        fallbackRedirectUrl={redirectUrl}
        appearance={appearance}
      />
    </ClerkAuthShell>
  );
}

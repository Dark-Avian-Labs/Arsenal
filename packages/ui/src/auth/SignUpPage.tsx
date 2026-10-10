import { SignUp } from '@clerk/react';
import { Navigate, useSearchParams } from 'react-router';

import { buildClerkAppearance, ClerkAuthShell } from '../clerk/index';
import { useAppShell } from '../shell/appShell';
import { useTheme } from '../theme/ThemeContext';
import { buildAuthPagePath, getAuthRedirectUrl } from './authRedirect';

export function SignUpPage({
  routing = 'path',
  title = 'Create account',
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
  const signInUrl = buildAuthPagePath(paths.signIn, redirectUrl);
  const shellTitle = title;
  const shellSubtitle = subtitle ?? `Join ${appName}.`;

  if (routing === 'hash') {
    return (
      <ClerkAuthShell title={shellTitle} subtitle={shellSubtitle}>
        <SignUp
          routing="hash"
          signInUrl={signInUrl}
          fallbackRedirectUrl={redirectUrl}
          appearance={appearance}
        />
      </ClerkAuthShell>
    );
  }

  return (
    <ClerkAuthShell title={shellTitle} subtitle={shellSubtitle}>
      <SignUp
        routing="path"
        path={paths.signUp}
        signInUrl={signInUrl}
        fallbackRedirectUrl={redirectUrl}
        appearance={appearance}
      />
    </ClerkAuthShell>
  );
}

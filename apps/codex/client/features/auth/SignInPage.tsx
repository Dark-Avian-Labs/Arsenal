import { APP_PATHS } from '@/app/paths';
import { SignIn } from '@clerk/react';
import { ClerkAuthShell, buildClerkAppearance, useTheme } from '@dark-avian-labs/ui';
import { Navigate, useSearchParams } from 'react-router';

import { getAuthRedirectUrl } from './authRedirect';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();

export function SignInPage() {
  const { mode } = useTheme();
  const [searchParams] = useSearchParams();
  const redirectUrl = getAuthRedirectUrl(searchParams);

  if (!publishableKey) {
    return <Navigate to={APP_PATHS.home} replace />;
  }

  return (
    <ClerkAuthShell
      title="Sign in to Codex"
      subtitle="Track Warframe and Epic Seven progress with your Dark Avian Labs account."
    >
      <SignIn
        routing="hash"
        signUpUrl={APP_PATHS.signUp}
        fallbackRedirectUrl={redirectUrl}
        appearance={buildClerkAppearance(mode)}
      />
    </ClerkAuthShell>
  );
}

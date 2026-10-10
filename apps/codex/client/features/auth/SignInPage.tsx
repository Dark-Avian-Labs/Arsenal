import { SignInPage as SharedSignInPage } from '@dark-avian-labs/ui';

import { getAuthFallbackRedirect } from './authRedirect';

export function SignInPage() {
  return (
    <SharedSignInPage
      routing="hash"
      title="Sign in to Codex"
      subtitle="Track Warframe and Epic Seven progress with your Dark Avian Labs account."
      fallbackPath={getAuthFallbackRedirect()}
    />
  );
}

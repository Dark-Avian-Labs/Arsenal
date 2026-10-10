import { SignUpPage as SharedSignUpPage } from '@dark-avian-labs/ui';

import { getAuthFallbackRedirect } from './authRedirect';

export function SignUpPage() {
  return (
    <SharedSignUpPage
      routing="hash"
      title="Create your account"
      subtitle="One account for Codex and Armory. We only store your user id in our apps."
      fallbackPath={getAuthFallbackRedirect()}
    />
  );
}

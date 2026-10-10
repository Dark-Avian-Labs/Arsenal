import { SignInPage as SharedSignInPage } from '@dark-avian-labs/ui';
import { useTranslation } from 'react-i18next';

import { CLERK_PUBLISHABLE_KEY } from '../../app/config';

export function SignInPage() {
  const { t } = useTranslation();
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="glass-surface mx-auto mt-10 max-w-md p-6 text-sm">
        {t('auth.clerkMissing')}
      </div>
    );
  }
  return (
    <SharedSignInPage
      routing="path"
      title={t('auth.signInTitle')}
      subtitle={t('auth.signInSubtitle')}
    />
  );
}

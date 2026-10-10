import { SignUpPage as SharedSignUpPage } from '@dark-avian-labs/ui';
import { useTranslation } from 'react-i18next';

import { CLERK_PUBLISHABLE_KEY } from '../../app/config';

export function SignUpPage() {
  const { t } = useTranslation();
  if (!CLERK_PUBLISHABLE_KEY) {
    return (
      <div className="glass-surface mx-auto mt-10 max-w-md p-6 text-sm">
        {t('auth.clerkMissing')}
      </div>
    );
  }
  return (
    <SharedSignUpPage
      routing="path"
      title={t('auth.signUpTitle')}
      subtitle={t('auth.signUpSubtitle')}
    />
  );
}

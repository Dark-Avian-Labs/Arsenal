import { ErrorBoundary } from '@dark-avian-labs/ui';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';

export function App() {
  const { t } = useTranslation();
  return (
    <ErrorBoundary
      fallbackTitle={t('app.crashTitle')}
      fallbackHint={t('app.crashHint')}
      fallbackReloadLabel={t('app.crashReload')}
    >
      <Outlet />
    </ErrorBoundary>
  );
}

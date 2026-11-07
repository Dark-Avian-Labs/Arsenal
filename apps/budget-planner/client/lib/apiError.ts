import { ApiError } from '@dark-avian-labs/ui';
import i18n from 'i18next';

export function apiErrorMessage(err: unknown, fallbackKey: string): string {
  if (err instanceof TypeError) return i18n.t('errors.offline');
  return i18n.t(
    err instanceof ApiError && err.code ? [`errors.${err.code}`, fallbackKey] : fallbackKey,
  );
}

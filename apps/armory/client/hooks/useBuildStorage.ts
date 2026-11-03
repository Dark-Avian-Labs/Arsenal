import { useAuth } from '@dark-avian-labs/ui';
import { useEffect } from 'react';

import { useBuildStorageContext } from '../context/BuildStorageContext';

export function useBuildStorage(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const { auth } = useAuth();
  const ctx = useBuildStorageContext();
  const signedIn = enabled && auth.status === 'authenticated';

  useEffect(() => {
    if (!signedIn) return;
    void ctx.refresh();
  }, [signedIn, ctx.refresh]);

  if (!signedIn) {
    return {
      ...ctx,
      builds: [],
      loading: enabled && auth.status === 'loading',
      getBuild: () => undefined,
    };
  }

  return ctx;
}

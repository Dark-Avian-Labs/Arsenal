import { useAuth as useClerkAuth } from '@clerk/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { API_UNAUTHORIZED_EVENT, apiFetch, setClerkTokenGetter } from '../api/apiFetch';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthState {
  status: AuthStatus;
  userId: string | null;
  isAdmin?: boolean;
}

interface AuthContextValue {
  auth: AuthState;
  refresh: () => Promise<void>;
}

const UNAUTHENTICATED: AuthState = { status: 'unauthenticated', userId: null, isAdmin: false };

const AuthContext = createContext<AuthContextValue>({
  auth: UNAUTHENTICATED,
  refresh: async () => {},
});

export function AuthProvider({
  children,
  resolveAdmin,
}: {
  children: ReactNode;
  resolveAdmin?: (apiIsAdmin: boolean) => boolean;
}) {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', userId: null, isAdmin: false });
  const refreshGenerationRef = useRef(0);

  useEffect(() => {
    setClerkTokenGetter((options) => getToken(options));
    return () => {
      setClerkTokenGetter(null);
    };
  }, [getToken]);

  const refresh = useCallback(async () => {
    if (!isLoaded) return;
    const generation = ++refreshGenerationRef.current;
    const applyAuth = (next: AuthState): void => {
      if (refreshGenerationRef.current === generation) setAuth(next);
    };
    if (!isSignedIn) {
      applyAuth(UNAUTHENTICATED);
      return;
    }
    try {
      const res = await apiFetch('/api/auth/me');
      if (res.status === 401) {
        applyAuth(UNAUTHENTICATED);
        return;
      }
      if (!res.ok) throw new Error(`Unexpected status ${res.status}`);
      const data = (await res.json()) as { userId?: string | null; isAdmin?: boolean };
      if (!data.userId) {
        applyAuth(UNAUTHENTICATED);
        return;
      }
      applyAuth({
        status: 'authenticated',
        userId: data.userId,
        isAdmin: data.isAdmin === true,
      });
    } catch {
      applyAuth({ status: 'error', userId: null, isAdmin: false });
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleUnauthorized = (): void => {
      void refresh();
    };
    window.addEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(API_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [refresh]);

  const value = useMemo(() => {
    if (auth.status !== 'authenticated' || !resolveAdmin) return { auth, refresh };
    return { auth: { ...auth, isAdmin: resolveAdmin(auth.isAdmin === true) }, refresh };
  }, [auth, refresh, resolveAdmin]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function DisabledAuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    setClerkTokenGetter(null);
  }, []);
  const value = useMemo(() => ({ auth: UNAUTHENTICATED, refresh: async () => {} }), []);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

import { useEffect, type ReactElement } from 'react';

import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { buildCentralAuthLoginUrl } from '../../utils/api';
import { useAuth } from './AuthContext';

function CentralAuthRedirect({ message }: { message: string }) {
  useEffect(() => {
    window.location.href = buildCentralAuthLoginUrl();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="text-muted text-sm">{message}</p>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactElement }) {
  const { status, logout } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted">Checking session...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <CentralAuthRedirect message="Redirecting to central authentication..." />;
  }

  if (status === 'forbidden') {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <GlassCard className="max-w-md p-6 text-center">
          <h1 className="text-foreground mb-2 text-xl font-semibold">Access denied</h1>
          <p className="text-muted mb-4 text-sm">
            Your account is authenticated but does not have access to this application.
          </p>
          <Button onClick={logout} variant="accent" type="button">
            Logout
          </Button>
        </GlassCard>
      </div>
    );
  }

  return children;
}

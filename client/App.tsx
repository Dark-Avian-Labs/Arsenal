import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import { AdminPage } from './components/Auth/AdminPage';
import { LoginPage } from './components/Auth/LoginPage';
import { HomePage } from './components/Home/HomePage';
import { Layout } from './components/Layout/Layout';
import { apiFetch, clearCsrfToken } from './utils/api';

type AuthStatus = 'loading' | 'unauthenticated' | 'forbidden' | 'ok';

function ProtectedLayout() {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const res = await apiFetch('/api/auth/me');
        if (!res.ok) {
          if (!cancelled) setStatus('unauthenticated');
          return;
        }

        const data = (await res.json()) as {
          authenticated?: boolean;
          has_game_access?: boolean;
        };

        if (!data.authenticated) {
          if (!cancelled) setStatus('unauthenticated');
          return;
        }

        if (!data.has_game_access) {
          if (!cancelled) setStatus('forbidden');
          return;
        }

        if (!cancelled) setStatus('ok');
      } catch {
        if (!cancelled) setStatus('unauthenticated');
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted">Checking session...</p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'forbidden') {
    const handleLogout = async () => {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      } finally {
        clearCsrfToken();
        window.location.href = '/login';
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="glass-panel max-w-md p-6 text-center">
          <h1 className="mb-2 text-xl font-semibold text-foreground">
            Access denied
          </h1>
          <p className="mb-4 text-sm text-muted">
            Your account is authenticated but does not have access to
            this application.
          </p>
          <button onClick={handleLogout} className="btn btn-accent">
            Logout
          </button>
        </div>
      </div>
    );
  }

  return <Layout />;
}

export function App() {
  return (
    <Routes>
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}

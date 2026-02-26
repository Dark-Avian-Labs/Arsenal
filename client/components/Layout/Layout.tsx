import { useState, useCallback } from 'react';
import { Outlet, NavLink } from 'react-router-dom';

import { SearchBar } from './SearchBar';
import bgArt from '../../assets/background.txt?raw';
import feathers from '../../assets/feathers.png';
import { useTheme } from '../../context/ThemeContext';
import { apiFetch, clearCsrfToken } from '../../utils/api';

export function Layout() {
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'ok' | 'err';
    message: string;
  } | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const { mode, toggleMode } = useTheme();

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // If logout request fails, still clear local CSRF and continue to login.
    } finally {
      clearCsrfToken();
      window.location.href = '/login';
    }
  }, []);

  const handleChangePassword = useCallback(async () => {
    const current = currentPassword;
    const next = newPassword;
    const confirm = confirmPassword;
    if (!current || !next) {
      setPasswordStatus({
        type: 'err',
        message: 'Current password and new password are required.',
      });
      return;
    }
    if (next.length < 8) {
      setPasswordStatus({
        type: 'err',
        message: 'New password must be at least 8 characters.',
      });
      return;
    }
    if (next !== confirm) {
      setPasswordStatus({ type: 'err', message: 'Passwords do not match.' });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        setPasswordStatus({
          type: 'err',
          message: body?.error || 'Failed to change password.',
        });
        return;
      }
      setPasswordStatus({ type: 'ok', message: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setPasswordStatus({
        type: 'err',
        message: 'Failed to change password.',
      });
    } finally {
      setPasswordSaving(false);
    }
  }, [confirmPassword, currentPassword, newPassword]);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-art" aria-hidden="true">
        {bgArt}
      </div>
      <header className="relative z-10 px-6 py-4">
        <div className="mx-auto flex max-w-[2000px] items-center justify-between gap-4">
          <h1 className="brand-lockup">
            <img
              src={feathers}
              alt="Dark Avian Labs feather mark"
              className="brand-lockup__icon"
            />
            <span className="brand-lockup__title">AppBase</span>
          </h1>

          <div className="flex flex-wrap items-center gap-3">
            <SearchBar />

            <nav className="flex gap-2">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `inline-flex items-center rounded-2xl border px-4 py-2 text-sm transition-all ${
                    isActive
                      ? 'border-accent bg-accent-weak text-accent'
                      : 'border-glass-border text-muted hover:border-glass-border-hover hover:text-foreground'
                  }`
                }
              >
                Home
              </NavLink>
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `inline-flex items-center rounded-2xl border px-4 py-2 text-sm transition-all ${
                    isActive
                      ? 'border-accent bg-accent-weak text-accent'
                      : 'border-glass-border text-muted hover:border-glass-border-hover hover:text-foreground'
                  }`
                }
              >
                Admin
              </NavLink>
            </nav>

            <button
              type="button"
              className="icon-toggle-btn"
              onClick={toggleMode}
              aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => {
                setShowChangePassword(true);
                setPasswordStatus(null);
              }}
            >
              Change Password
            </button>
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="relative z-10 flex-1 px-6 pb-6">
        <Outlet />
      </main>

      {showChangePassword && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowChangePassword(false);
            setPasswordStatus(null);
          }}
        >
          <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-lg font-semibold text-foreground">
              Change Password
            </h3>
            <div className="space-y-3">
              <input
                type="password"
                className="form-input"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <input
                type="password"
                className="form-input"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                type="password"
                className="form-input"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {passwordStatus && (
              <p
                className={`mt-3 text-sm ${
                  passwordStatus.type === 'ok' ? 'text-success' : 'text-danger'
                }`}
              >
                {passwordStatus.message}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => {
                  setShowChangePassword(false);
                  setPasswordStatus(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-accent text-sm"
                onClick={handleChangePassword}
                disabled={passwordSaving}
              >
                {passwordSaving ? 'Saving...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

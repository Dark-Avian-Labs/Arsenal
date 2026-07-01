import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, Outlet } from 'react-router-dom';

import bgArt from '../../../assets/background.txt?raw';
import feathers from '../../../assets/feathers.png';
import { APP_DISPLAY_NAME, LEGAL_ENTITY_NAME } from '../../app/config';
import { APP_PATHS } from '../../app/paths';
import { Menu } from '../../components/ui/Menu';
import { UiStyleSelector } from '../../components/ui/UiStyleSelector';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../features/auth/AuthContext';
import { buildCentralAuthLoginUrl } from '../../utils/api';
import { getProfileIconSrc } from '../../utils/profileIcons';
import { SearchBar } from './SearchBar';

export function Layout() {
  const { mode, toggleMode } = useTheme();
  const { account, logout } = useAuth();
  const currentYear = new Date().getFullYear();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleLogout = useCallback(async () => {
    await logout();
  }, [logout]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [userMenuOpen]);

  const profile = account.profile;
  const isLoggedIn = account.isAuthenticated && profile !== null;
  const isAdmin = profile?.isAdmin === true;
  const avatarSrc = getProfileIconSrc(profile?.avatarId ?? 1);

  return (
    <div className="flex min-h-screen flex-col">
      <div className="bg-art" aria-hidden="true">
        {bgArt}
      </div>
      <header className="relative z-30 h-[100px] px-6">
        <div className="mx-auto grid h-full w-full max-w-[2000px] grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Link to={APP_PATHS.home} className="brand-lockup w-fit">
            <img src={feathers} alt="Dark Avian Labs feather mark" className="brand-lockup__icon" />
            <span className="brand-lockup__title brand-lockup--fx">{APP_DISPLAY_NAME}</span>
          </Link>

          <div className="justify-self-center">{isLoggedIn ? <SearchBar /> : null}</div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="icon-toggle-btn"
              onClick={toggleMode}
              aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
            >
              <span aria-hidden="true">{mode === 'dark' ? '☀' : '☾'}</span>
            </button>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                className="icon-toggle-btn profile-avatar-btn"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-label="Open user menu"
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <img src={avatarSrc} alt="" className="profile-avatar-image" />
              </button>
              {userMenuOpen && (
                <Menu>
                  {!isLoggedIn ? (
                    <a
                      href={buildCentralAuthLoginUrl()}
                      className="user-menu-item"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      Login
                    </a>
                  ) : (
                    <>
                      {isAdmin && (
                        <Link
                          to={APP_PATHS.admin}
                          className="user-menu-item"
                          role="menuitem"
                          onClick={() => setUserMenuOpen(false)}
                        >
                          Admin
                        </Link>
                      )}
                      <Link
                        to={APP_PATHS.profile}
                        className="user-menu-item"
                        role="menuitem"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        Profile
                      </Link>
                      <button
                        type="button"
                        className="user-menu-item text-left"
                        role="menuitem"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleLogout();
                        }}
                      >
                        Logout
                      </button>
                    </>
                  )}
                  <div className="user-menu-divider" role="separator" />
                  <UiStyleSelector />
                </Menu>
              )}
            </div>
          </div>
        </div>
      </header>
      <main className="relative z-0 flex-1 px-6 pb-6">
        <div className="mx-auto w-full max-w-[2000px]">
          <Outlet />
        </div>
      </main>
      <footer className="relative z-10 flex h-[50px] items-center justify-center px-6">
        <div className="mx-auto w-full max-w-[2000px] text-center">
          <Link to={APP_PATHS.legal} className="text-muted hover:text-foreground text-sm">
            ©{currentYear} {LEGAL_ENTITY_NAME}
          </Link>
        </div>
      </footer>
    </div>
  );
}

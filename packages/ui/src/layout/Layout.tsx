import { useClerk, useUser } from '@clerk/react';
import { Suspense, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router';

import feathers from '../assets/feathers.svg';
import { useAuth } from '../auth/AuthContext';
import { buildClerkProfileAppearance } from '../clerk/index';
import { ChunkErrorBoundary } from '../components/ChunkErrorBoundary';
import { Menu } from '../components/Menu';
import { UiStyleSelector } from '../components/UiStyleSelector';
import { useRovingMenu } from '../components/useRovingMenu';
import { MaterialSymbol } from '../icons';
import { isSentinelAdmin } from '../lib/dalAppNav';
import { useAppShell } from '../shell/appShell';
import { useTheme } from '../theme/ThemeContext';
import { DalAppNav } from './DalAppNav';
import { SearchBar } from './SearchBar';
import { StaleClientUpdateBanner } from './StaleClientUpdateBanner';

export interface LayoutProps {
  navItems?: ReactNode;
  headerSlot?: ReactNode;
  subheaderSlot?: ReactNode;
  width?: 'wide' | 'narrow';
  showSearch?: boolean;
  adminPath?: string;
  reloadHome?: boolean;
}

function LegalMenuItem({ href }: { href: string }) {
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      className="user-menu-item"
      role="menuitem"
      tabIndex={-1}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
    >
      Legal
    </a>
  );
}

function ClerkUserMenuItems({
  onClose,
  adminPath,
  legalPageUrl,
}: {
  onClose: () => void;
  adminPath?: string;
  legalPageUrl: string;
}) {
  const { paths } = useAppShell();
  const { mode } = useTheme();
  const { auth } = useAuth();
  const clerk = useClerk();
  const isLoggedIn = auth.status === 'authenticated';

  if (!isLoggedIn) {
    return (
      <>
        <Link
          to={paths.signIn}
          className="user-menu-item"
          role="menuitem"
          tabIndex={-1}
          onClick={onClose}
        >
          Sign in
        </Link>
        <div className="user-menu-divider" role="separator" />
        <UiStyleSelector />
        <LegalMenuItem href={legalPageUrl} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="user-menu-item text-left"
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          onClose();
          clerk.openUserProfile({
            appearance: buildClerkProfileAppearance(mode),
          });
        }}
      >
        Profile
      </button>
      <div className="user-menu-divider" role="separator" />
      <UiStyleSelector />
      <LegalMenuItem href={legalPageUrl} />
      {adminPath && auth.status === 'authenticated' && auth.isAdmin === true ? (
        <Link
          to={adminPath}
          className="user-menu-item"
          role="menuitem"
          tabIndex={-1}
          onClick={onClose}
        >
          Admin
        </Link>
      ) : null}
      <button
        type="button"
        className="user-menu-item text-left"
        role="menuitem"
        tabIndex={-1}
        onClick={() => {
          onClose();
          void clerk.signOut({ redirectUrl: paths.home });
        }}
      >
        Logout
      </button>
    </>
  );
}

function ClerkDalAppNav({ currentAppId }: { currentAppId: string }) {
  const { isLoaded, user } = useUser();
  return (
    <DalAppNav
      currentAppId={currentAppId}
      showSentinel={isLoaded && isSentinelAdmin(user?.publicMetadata)}
    />
  );
}

export function Layout({
  navItems,
  headerSlot,
  subheaderSlot,
  width = 'wide',
  showSearch = true,
  adminPath,
  reloadHome = true,
}: LayoutProps = {}) {
  const location = useLocation();
  const { appName, appId, version, clerkEnabled, legalPageUrl, paths } = useAppShell();
  const { mode, toggleMode } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const frame = width === 'narrow' ? 'max-w-3xl' : 'max-w-[2000px]';
  const { menuRef, triggerRef, onMenuKeyDown } = useRovingMenu(userMenuOpen, setUserMenuOpen);
  const userMenuId = 'appbase-user-menu';

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {clerkEnabled ? <ClerkDalAppNav currentAppId={appId} /> : <DalAppNav currentAppId={appId} />}
      <header className="relative z-30 min-h-14 px-6">
        <div
          className={`mx-auto grid min-h-14 w-full ${frame} grid-cols-[1fr_auto_1fr] items-center gap-4`}
        >
          <div className="flex w-fit max-w-full min-w-0 items-baseline gap-2 justify-self-start">
            <Link
              to={paths.home}
              className="brand-lockup w-fit"
              onClick={(event) => {
                if (!reloadHome) return;
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0 ||
                  location.pathname !== paths.home
                ) {
                  return;
                }
                event.preventDefault();
                window.location.reload();
              }}
            >
              <img
                src={feathers}
                alt="Dark Avian Labs feather mark"
                className="brand-lockup__icon"
              />
              <span className="brand-lockup__title">{appName}</span>
            </Link>
            <span
              className="text-muted font-mono text-[11px] leading-none"
              title={`Client ${version}`}
            >
              v{version}
            </span>
            {navItems}
          </div>

          <div className="justify-self-center">
            {headerSlot ?? (showSearch ? <SearchBar /> : null)}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="icon-toggle-btn"
              onClick={toggleMode}
              aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
              title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
            >
              {mode === 'dark' ? (
                <MaterialSymbol name="light_mode" filled />
              ) : (
                <MaterialSymbol name="dark_mode" filled />
              )}
            </button>
            <div ref={menuRef} className="relative">
              <button
                ref={triggerRef}
                type="button"
                className="icon-toggle-btn"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                aria-controls={userMenuOpen ? userMenuId : undefined}
                aria-label="Open user menu"
                onClick={() => setUserMenuOpen((prev) => !prev)}
              >
                <MaterialSymbol name="person" filled />
              </button>
              {userMenuOpen ? (
                <Menu>
                  <div
                    id={userMenuId}
                    role="menu"
                    aria-orientation="vertical"
                    onKeyDown={onMenuKeyDown}
                  >
                    {clerkEnabled ? (
                      <ClerkUserMenuItems
                        adminPath={adminPath}
                        legalPageUrl={legalPageUrl}
                        onClose={() => setUserMenuOpen(false)}
                      />
                    ) : (
                      <>
                        <UiStyleSelector />
                        <LegalMenuItem href={legalPageUrl} />
                      </>
                    )}
                  </div>
                </Menu>
              ) : null}
            </div>
          </div>
        </div>
      </header>
      {subheaderSlot}
      <main id="main-content" className="relative z-0 flex-1 px-6 pb-6">
        <div className={`mx-auto w-full ${frame}`}>
          <ChunkErrorBoundary>
            <Suspense
              fallback={
                <p className="text-muted py-6 text-sm" role="status">
                  Loading...
                </p>
              }
            >
              <Outlet />
            </Suspense>
          </ChunkErrorBoundary>
        </div>
      </main>
      <StaleClientUpdateBanner appVersion={version} />
    </div>
  );
}

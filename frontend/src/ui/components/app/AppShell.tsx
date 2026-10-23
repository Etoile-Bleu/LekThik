import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { useMediaQuery } from '@hooks/useMediaQuery';
import { applyAppearance, pickAppearance, watchSystemSettings } from '@lib/appearance';
import { useCommandStore } from '@lib/commandStore';
import { useFullscreenStore, watchFullscreen } from '@lib/fullscreenStore';
import { useInvitationStore } from '@lib/invitationStore';
import { usePrefsStore } from '@lib/prefsStore';
import { startRealtime } from '@lib/realtime';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { CommandPalette } from '../command/CommandPalette';
import { useGlobalCommands } from '../command/useGlobalCommands';
import { InvitationsButton } from '../collab/InvitationsButton';
import { LiveIndicator } from '../collab/LiveIndicator';
import { MaximizeIcon, MenuIcon, MinimizeIcon, SearchIcon, SidebarIcon } from '../ui/Icons';
import { Dialog } from '../ui/Dialog';
import { LiveAnnouncer } from '../ui/LiveAnnouncer';
import { Toaster } from '../ui/Toaster';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import './AppShell.css';

export function AppShell() {
  const isWide = useMediaQuery('(min-width: 900px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const loadWorkspaces = useWorkspaceStore((state) => state.load);
  const loadInvitations = useInvitationStore((state) => state.load);
  const loadPrefs = usePrefsStore((state) => state.load);
  const location = useLocation();
  useGlobalCommands();
  const openPalette = useCommandStore((state) => state.openPalette);
  const fullscreen = useFullscreenStore((state) => state.active);
  const navOpen = useFullscreenStore((state) => state.navOpen);
  const enterFullscreen = useFullscreenStore((state) => state.enter);
  const exitFullscreen = useFullscreenStore((state) => state.exit);
  const setNavOpen = useFullscreenStore((state) => state.setNavOpen);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => watchFullscreen(), []);

  // The navigation slides in when the pointer reaches the left edge and slides out soon after it leaves.
  function openNav() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setNavOpen(true);
  }
  function closeNavSoon() {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setNavOpen(false), 380);
  }

  useEffect(() => {
    void loadWorkspaces();
    void loadInvitations();
    void loadPrefs();
    return startRealtime();
  }, [loadWorkspaces, loadInvitations, loadPrefs]);

  // "System" follows the device, so re-apply when the device changes its mind.
  useEffect(
    () =>
      watchSystemSettings(() => applyAppearance(pickAppearance(usePrefsStore.getState().prefs))),
    []
  );

  useEffect(() => {
    setDrawerOpen(false);
    setNavOpen(false);
  }, [location.pathname, setNavOpen]);

  return (
    <div
      className="shell"
      data-fullscreen={fullscreen || undefined}
      data-nav-open={navOpen || undefined}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="shell__topbar">
        {!isWide && (
          <button
            type="button"
            className="icon-button shell__menu"
            aria-label="Open navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon size={22} />
          </button>
        )}
        <Link className="shell__brand" to="/dashboard">
          <img className="shell__mark" src="/logo-icon-dark.svg" alt="" width="26" height="26" />
          LekThik
        </Link>
        <div className="shell__spacer" />
        <button
          type="button"
          className="shell__search"
          aria-keyshortcuts="Control+K Meta+K"
          onClick={openPalette}
        >
          <SearchIcon size={16} />
          <span className="shell__search-text">Search or run a command</span>
          <kbd className="shell__search-key" aria-hidden="true">
            {typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform)
              ? '⌘K'
              : 'Ctrl K'}
          </kbd>
        </button>
        <button
          type="button"
          className="shell__fullscreen"
          aria-label="Enter full screen"
          title="Full screen"
          onClick={() => void enterFullscreen()}
        >
          <MaximizeIcon size={18} />
        </button>
        <LiveIndicator />
        <InvitationsButton />
        <UserMenu />
      </header>

      <div className="shell__body">
        {isWide && (
          <aside
            className="shell__sidebar"
            onPointerEnter={fullscreen ? openNav : undefined}
            onPointerLeave={fullscreen ? closeNavSoon : undefined}
            onFocus={fullscreen ? openNav : undefined}
            onBlur={
              fullscreen
                ? (event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) closeNavSoon();
                  }
                : undefined
            }
          >
            <Sidebar onNavigate={fullscreen ? () => setNavOpen(false) : undefined} />
          </aside>
        )}
        <main id="main" tabIndex={-1} className="shell__main">
          <Outlet />
        </main>
      </div>

      {!isWide && (
        <Dialog
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title="Navigation"
          variant="drawer"
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </Dialog>
      )}

      {fullscreen && isWide && (
        <div className="shell__edge" aria-hidden="true" onPointerEnter={openNav} />
      )}
      {/* One corner for the floating controls: the board tools join the full screen buttons here. */}
      <div id="shell-dock" className="shell__dock" role="region" aria-label="Board controls">
        {fullscreen && (
          <div className="shell__float" role="group" aria-label="Full screen">
            <button
              type="button"
              className="shell__float-button"
              aria-expanded={isWide ? navOpen : drawerOpen}
              onClick={() => (isWide ? setNavOpen(!navOpen) : setDrawerOpen(true))}
            >
              <SidebarIcon size={16} />
              Navigation
            </button>
            <button
              type="button"
              className="shell__float-button"
              onClick={() => void exitFullscreen()}
            >
              <MinimizeIcon size={16} />
              Exit full screen
            </button>
          </div>
        )}
      </div>
      <CommandPalette />
      <LiveAnnouncer />
      <Toaster />
    </div>
  );
}

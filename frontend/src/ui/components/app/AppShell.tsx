import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { useMediaQuery } from '@hooks/useMediaQuery';
import { applyAppearance, pickAppearance, watchSystemSettings } from '@lib/appearance';
import { useCommandStore } from '@lib/commandStore';
import { useInvitationStore } from '@lib/invitationStore';
import { usePrefsStore } from '@lib/prefsStore';
import { startRealtime } from '@lib/realtime';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { CommandPalette } from '../command/CommandPalette';
import { useGlobalCommands } from '../command/useGlobalCommands';
import { InvitationsButton } from '../collab/InvitationsButton';
import { LiveIndicator } from '../collab/LiveIndicator';
import { MenuIcon, SearchIcon } from '../ui/Icons';
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
  }, [location.pathname]);

  return (
    <div className="shell">
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
        <LiveIndicator />
        <InvitationsButton />
        <UserMenu />
      </header>

      <div className="shell__body">
        {isWide && (
          <aside className="shell__sidebar">
            <Sidebar />
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

      <CommandPalette />
      <LiveAnnouncer />
      <Toaster />
    </div>
  );
}

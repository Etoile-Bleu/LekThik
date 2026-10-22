import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';

import { useMediaQuery } from '@hooks/useMediaQuery';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { MenuIcon } from '../ui/Icons';
import { Dialog } from '../ui/Dialog';
import { Toaster } from '../ui/Toaster';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import './AppShell.css';

export function AppShell() {
  const isWide = useMediaQuery('(min-width: 900px)');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const loadWorkspaces = useWorkspaceStore((state) => state.load);
  const location = useLocation();

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

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
          <span className="shell__mark" aria-hidden="true" />
          LekThik
        </Link>
        <div className="shell__spacer" />
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

      <Toaster />
    </div>
  );
}

import { useNavigate } from 'react-router-dom';

import { logoutUser } from '@lib/api';
import { resetMyCards } from '@lib/myCardsStore';
import { usePrefsStore } from '@lib/prefsStore';
import { useAuthStore } from '@lib/authStore';
import { useBoardStore } from '@lib/boardStore';
import { notifyError } from '@lib/toastStore';
import { useWorkspaceStore } from '@lib/workspaceStore';

import { ChevronDownIcon, HelpIcon, SignOutIcon, SlidersIcon } from '../ui/Icons';
import { Menu } from '../ui/Menu';
import './UserMenu.css';

export function UserMenu() {
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await logoutUser();
    } catch (error) {
      notifyError(error, 'Could not sign you out.');
      return;
    }
    useWorkspaceStore.getState().reset();
    useBoardStore.getState().reset();
    usePrefsStore.getState().reset();
    resetMyCards();
    clearUser();
    navigate('/');
  }

  return (
    <Menu
      label={`Account menu for ${user?.username ?? 'you'}`}
      triggerClassName="user-menu__trigger"
      trigger={
        <>
          <span
            className="user-menu__avatar"
            data-initial={(user?.username ?? '?').charAt(0).toUpperCase()}
            aria-hidden="true"
          />
          <span className="user-menu__name">{user?.username}</span>
          <ChevronDownIcon size={16} />
        </>
      }
      items={[
        { label: 'Settings', icon: <SlidersIcon />, onSelect: () => navigate('/settings') },
        {
          label: 'Keyboard and help',
          icon: <HelpIcon />,
          onSelect: () => navigate('/settings/help'),
        },
        { label: 'Sign out', icon: <SignOutIcon />, onSelect: () => void signOut() },
      ]}
    />
  );
}

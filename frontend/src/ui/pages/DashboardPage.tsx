import { useNavigate } from 'react-router-dom';

import { logoutUser } from '@lib/api';
import { useAuthStore } from '@lib/authStore';

import './DashboardPage.css';

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearUser = useAuthStore((state) => state.clearUser);

  async function handleSignOut() {
    await logoutUser();
    clearUser();
    navigate('/');
  }

  return (
    <div className="dashboard">
      <div className="container dashboard__inner">
        <div className="dashboard__header">
          <div>
            <p className="dashboard__eyebrow">Dashboard</p>
            <h1 className="dashboard__title">Welcome{user ? `, ${user.username}` : ''}</h1>
          </div>
          <button className="dashboard__signout" type="button" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <div className="dashboard__placeholder">
          <p className="dashboard__placeholder-title">Boards are coming next.</p>
          <p className="dashboard__placeholder-text">
            Sprint 1 covers accounts and this page. Boards, lists and cards land in the sprints that
            follow.
          </p>
        </div>
      </div>
    </div>
  );
}

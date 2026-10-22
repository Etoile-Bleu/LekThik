import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '@lib/authStore';
import { withNext } from '@lib/nextPath';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const checkSession = useAuthStore((state) => state.checkSession);
  const location = useLocation();

  if (status === 'idle' || status === 'loading') {
    return null;
  }

  if (status === 'unauthenticated') {
    const target = location.pathname.startsWith('/invitations/') ? location.pathname : null;
    return <Navigate to={withNext('/login', target)} replace />;
  }

  if (status === 'unreachable') {
    return (
      <div className="protected-unreachable" role="alert">
        <h1>We cannot reach LekThik right now</h1>
        <p>Your session is safe. Check your connection and try again.</p>
        <button type="button" className="btn btn--primary" onClick={() => void checkSession()}>
          Try again
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@lib/authStore';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const checkSession = useAuthStore((state) => state.checkSession);

  if (status === 'idle' || status === 'loading') {
    return null;
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
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

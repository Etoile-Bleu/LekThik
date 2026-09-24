import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useAuthStore } from '@lib/authStore';

import { ProtectedRoute } from './ProtectedRoute';

function renderProtectedRoute() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <p>secret dashboard</p>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'idle' });
  });

  it('renders nothing while the session is still resolving', () => {
    useAuthStore.setState({ status: 'loading' });

    renderProtectedRoute();

    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('redirects to login when unauthenticated', () => {
    useAuthStore.setState({ status: 'unauthenticated' });

    renderProtectedRoute();

    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('renders the protected content when authenticated', () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: { id: '1', email: 'mathéo@example.com', username: 'matheo' },
    });

    renderProtectedRoute();

    expect(screen.getByText('secret dashboard')).toBeInTheDocument();
  });
});

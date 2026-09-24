import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from './api';

vi.mock('./api', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from './api';
import { useAuthStore } from './authStore';

const user: CurrentUser = {
  id: '1',
  email: 'mathéo@example.com',
  username: 'matheo',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, status: 'idle' });
    vi.mocked(getCurrentUser).mockReset();
  });

  it('starts idle with no user', () => {
    expect(useAuthStore.getState().status).toBe('idle');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('marks the store authenticated on setUser', () => {
    useAuthStore.getState().setUser(user);

    expect(useAuthStore.getState()).toMatchObject({ user, status: 'authenticated' });
  });

  it('clears the user and marks unauthenticated on clearUser', () => {
    useAuthStore.getState().setUser(user);

    useAuthStore.getState().clearUser();

    expect(useAuthStore.getState()).toMatchObject({ user: null, status: 'unauthenticated' });
  });

  it('authenticates when checkSession resolves a user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(user);

    await useAuthStore.getState().checkSession();

    expect(useAuthStore.getState()).toMatchObject({ user, status: 'authenticated' });
  });

  it('marks unauthenticated when checkSession rejects', async () => {
    vi.mocked(getCurrentUser).mockRejectedValueOnce(new Error('no session'));

    await useAuthStore.getState().checkSession();

    expect(useAuthStore.getState()).toMatchObject({ user: null, status: 'unauthenticated' });
  });
});

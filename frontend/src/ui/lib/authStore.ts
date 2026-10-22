import { create } from 'zustand';

import { ApiError, type CurrentUser, getCurrentUser } from '@lib/api';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated' | 'unreachable';

interface AuthState {
  user: CurrentUser | null;
  status: AuthStatus;
  setUser: (user: CurrentUser) => void;
  clearUser: () => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',
  setUser: (user) => set({ user, status: 'authenticated' }),
  clearUser: () => set({ user: null, status: 'unauthenticated' }),
  checkSession: async () => {
    set({ status: 'loading' });
    try {
      const user = await getCurrentUser();
      set({ user, status: 'authenticated' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        set({ user: null, status: 'unauthenticated' });
        return;
      }
      set({ status: get().user ? 'authenticated' : 'unreachable' });
    }
  },
}));

import { create } from 'zustand';

import { type CurrentUser, getCurrentUser } from '@lib/api';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: CurrentUser | null;
  status: AuthStatus;
  setUser: (user: CurrentUser) => void;
  clearUser: () => void;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'idle',
  setUser: (user) => set({ user, status: 'authenticated' }),
  clearUser: () => set({ user: null, status: 'unauthenticated' }),
  checkSession: async () => {
    set({ status: 'loading' });
    try {
      const user = await getCurrentUser();
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, status: 'unauthenticated' });
    }
  },
}));

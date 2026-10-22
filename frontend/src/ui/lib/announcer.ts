import { create } from 'zustand';

interface AnnouncerState {
  message: string;
  /** Bumps on every call so the same sentence is read again. */
  tick: number;
  announce: (message: string) => void;
}

/** One polite live region for the whole app, so screen readers hear what changed. */
export const useAnnouncer = create<AnnouncerState>((set) => ({
  message: '',
  tick: 0,
  announce: (message) => set((state) => ({ message, tick: state.tick + 1 })),
}));

export function announce(message: string): void {
  useAnnouncer.getState().announce(message);
}

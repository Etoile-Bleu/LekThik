import { create } from 'zustand';

import { type AssignedCard, fetchMyCards } from './boardsApi';

const RETRY_MS = 5000;
let retryTimer: number | undefined;

export type MyCardsStatus = 'loading' | 'ready' | 'error';

interface MyCardsState {
  cards: AssignedCard[];
  status: MyCardsStatus;
  /** How many screens show the cards, so the live stream only refetches what someone is looking at. */
  watchers: number;
  /** Loads with a spinner, for the first visit or after an error. */
  load: () => Promise<void>;
  /** Loads again without disturbing what is on screen. */
  refresh: () => Promise<void>;
  watch: () => () => void;
}

export const useMyCardsStore = create<MyCardsState>((set, get) => ({
  cards: [],
  status: 'loading',
  watchers: 0,

  load: async () => {
    set({ status: 'loading' });
    try {
      set({ cards: await fetchMyCards(), status: 'ready' });
    } catch {
      set({ status: 'error' });
    }
  },

  refresh: async () => {
    try {
      set({ cards: await fetchMyCards(), status: 'ready' });
    } catch {
      // A failed refresh keeps what is shown and tries once more soon, so a hiccup never
      // leaves the page stale until the next change.
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        if (get().watchers > 0) void get().refresh();
      }, RETRY_MS);
    }
  },

  watch: () => {
    set((state) => ({ watchers: state.watchers + 1 }));
    return () => set((state) => ({ watchers: Math.max(0, state.watchers - 1) }));
  },
}));

/** True while the my cards page is open, which is when a change elsewhere is worth a request. */
export function myCardsAreWatched(): boolean {
  return useMyCardsStore.getState().watchers > 0;
}

export function resetMyCards(): void {
  useMyCardsStore.setState({ cards: [], status: 'loading', watchers: 0 });
}

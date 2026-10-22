import { create } from 'zustand';

import { applyAppearance, cacheAppearance, pickAppearance } from './appearance';
import {
  type BoardPreferences,
  type CardDialogLayout,
  type CardDisplay,
  DEFAULT_PREFERENCES,
  type Preferences,
  boardPrefsFor,
  isDefaultBoardPrefs,
} from './prefs';
import { fetchPreferences, savePreferences } from './prefsApi';

const SAVE_DELAY_MS = 600;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PrefsState {
  prefs: Preferences;
  loaded: boolean;
  /** Changes save by themselves, this is what the page shows about it. */
  saveState: SaveState;
  /** Reads the saved settings of the signed in person and applies them. */
  load: () => Promise<void>;
  update: (changes: Partial<Omit<Preferences, 'boards'>>) => void;
  setCardDisplay: (display: CardDisplay) => void;
  /** `null` drops a board's own setting so it follows the general one again. */
  setBoardCardDisplay: (boardId: string, display: CardDisplay | null) => void;
  /** Changes what this person chose for one board: its view, column width or folded lists. */
  updateBoard: (boardId: string, changes: Partial<BoardPreferences>) => void;
  /** Folds a list into a rail, or opens it again. */
  toggleListCollapsed: (boardId: string, listId: string) => void;
  setCardDialog: (layout: CardDialogLayout) => void;
  reset: () => void;
}

let saveTimer: number | undefined;

export const usePrefsStore = create<PrefsState>((set, get) => {
  const commit = (next: Preferences) => {
    set({ prefs: next, saveState: 'saving' });
    const appearance = pickAppearance(next);
    applyAppearance(appearance);
    cacheAppearance(appearance);

    // Settings change in bursts (dragging through options), so save once they settle.
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      savePreferences(get().prefs)
        .then(() => set({ saveState: 'saved' }))
        .catch(() => set({ saveState: 'error' }));
    }, SAVE_DELAY_MS);
  };

  return {
    prefs: DEFAULT_PREFERENCES,
    loaded: false,
    saveState: 'idle',

    load: async () => {
      try {
        const prefs = await fetchPreferences();
        set({ prefs, loaded: true });
        const appearance = pickAppearance(prefs);
        applyAppearance(appearance);
        cacheAppearance(appearance);
      } catch {
        set({ loaded: true });
      }
    },

    update: (changes) => commit({ ...get().prefs, ...changes }),

    setCardDisplay: (display) => commit({ ...get().prefs, card_display: display }),

    setBoardCardDisplay: (boardId, display) =>
      get().updateBoard(boardId, { card_display: display }),

    updateBoard: (boardId, changes) => {
      const boards: Record<string, BoardPreferences> = { ...get().prefs.boards };
      const next = { ...boardPrefsFor(get().prefs, boardId), ...changes };
      if (isDefaultBoardPrefs(next)) {
        delete boards[boardId];
      } else {
        boards[boardId] = next;
      }
      commit({ ...get().prefs, boards });
    },

    toggleListCollapsed: (boardId, listId) => {
      const current = boardPrefsFor(get().prefs, boardId).collapsed_lists;
      get().updateBoard(boardId, {
        collapsed_lists: current.includes(listId)
          ? current.filter((id) => id !== listId)
          : [...current, listId],
      });
    },

    setCardDialog: (layout) => commit({ ...get().prefs, card_dialog: layout }),

    reset: () => {
      window.clearTimeout(saveTimer);
      set({ prefs: DEFAULT_PREFERENCES, loaded: false, saveState: 'idle' });
    },
  };
});

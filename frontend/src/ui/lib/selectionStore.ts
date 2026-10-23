import { create } from 'zustand';

import { announce } from './announcer';

interface SelectionState {
  /** Cards and panels (lists and blocks) picked with the rectangle, a click with Shift or Ctrl, or the menu. */
  cards: string[];
  panels: string[];
  /** Silent while a rectangle is still being drawn, so a screen reader hears the result once. */
  setSelection: (cards: string[], panels: string[], speak?: boolean) => void;
  toggleCard: (id: string) => void;
  togglePanel: (id: string) => void;
  clear: () => void;
}

export function describeSelection(cards: number, panels: number): string {
  const parts: string[] = [];
  if (cards > 0) parts.push(`${cards} card${cards === 1 ? '' : 's'}`);
  if (panels > 0) parts.push(`${panels} ${panels === 1 ? 'list or block' : 'lists and blocks'}`);
  return parts.length === 0 ? 'Nothing selected' : `${parts.join(' and ')} selected`;
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  cards: [],
  panels: [],

  setSelection: (cards, panels, speak = true) => {
    const state = get();
    if (same(state.cards, cards) && same(state.panels, panels)) return;
    set({ cards, panels });
    if (speak) announce(describeSelection(cards.length, panels.length) + '.');
  },

  toggleCard: (id) => {
    const { cards, panels } = get();
    get().setSelection(
      cards.includes(id) ? cards.filter((item) => item !== id) : [...cards, id],
      panels
    );
  },

  togglePanel: (id) => {
    const { cards, panels } = get();
    get().setSelection(
      cards,
      panels.includes(id) ? panels.filter((item) => item !== id) : [...panels, id]
    );
  },

  clear: () => {
    if (get().cards.length === 0 && get().panels.length === 0) return;
    set({ cards: [], panels: [] });
    announce('Selection cleared.');
  },
}));

export function hasSelection(): boolean {
  const { cards, panels } = useSelectionStore.getState();
  return cards.length + panels.length > 0;
}

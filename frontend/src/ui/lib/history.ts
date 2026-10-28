import { create } from 'zustand';

import { announce } from './announcer';
import { notifyError } from './toastStore';

export interface HistoryEntry {
  label: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

interface StoredEntry extends HistoryEntry {
  id: number;
}

export const HISTORY_LIMIT = 100;

let replaying = false;
let nextEntryId = 1;
const aliases = new Map<string, string>();

export function isReplaying(): boolean {
  return replaying;
}

export function alias(oldId: string, newId: string): void {
  if (oldId !== newId) aliases.set(oldId, newId);
}

export function resolveId(id: string): string {
  let current = id;
  for (let hops = 0; hops < 50; hops += 1) {
    const next = aliases.get(current);
    if (next === undefined || next === current) return current;
    current = next;
  }
  return current;
}

interface HistoryState {
  past: StoredEntry[];
  future: StoredEntry[];
  busy: boolean;
  revision: number;
  record: (entry: HistoryEntry) => number;
  undo: () => Promise<string | null>;
  redo: () => Promise<string | null>;
  clear: () => void;
  /** Drops one entry by the id `record` gave it, without running its undo or redo. */
  retire: (id: number) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => {
  async function replay(
    take: (state: HistoryState) => StoredEntry | undefined,
    run: (entry: StoredEntry) => Promise<void>,
    land: (state: HistoryState, entry: StoredEntry) => Partial<HistoryState>,
    stack: 'past' | 'future',
    failure: string
  ): Promise<string | null> {
    const state = get();
    if (state.busy) return null;
    const entry = take(state);
    if (!entry) return null;
    set({ busy: true });
    replaying = true;
    try {
      await run(entry);
      set((current) => ({ ...land(current, entry), busy: false }));
      return entry.label;
    } catch (error) {
      notifyError(error, failure);
      set((current) => ({
        [stack]: current[stack].filter((candidate) => candidate !== entry),
        busy: false,
      }));
      return null;
    } finally {
      replaying = false;
      set((current) => ({ revision: current.revision + 1 }));
    }
  }

  return {
    past: [],
    future: [],
    busy: false,
    revision: 0,

    record: (entry) => {
      if (replaying) return 0;
      const id = nextEntryId;
      nextEntryId += 1;
      set((state) => ({
        past: [...state.past, { ...entry, id }].slice(-HISTORY_LIMIT),
        future: [],
      }));
      return id;
    },

    undo: () =>
      replay(
        (state) => state.past[state.past.length - 1],
        (entry) => entry.undo(),
        (state, entry) => ({
          past: state.past.filter((candidate) => candidate !== entry),
          future: [...state.future, entry],
        }),
        'past',
        'That change could not be undone.'
      ),

    redo: () =>
      replay(
        (state) => state.future[state.future.length - 1],
        (entry) => entry.redo(),
        (state, entry) => ({
          future: state.future.filter((candidate) => candidate !== entry),
          past: [...state.past, entry].slice(-HISTORY_LIMIT),
        }),
        'future',
        'That change could not be redone.'
      ),

    clear: () => {
      aliases.clear();
      set({ past: [], future: [], busy: false });
    },

    retire: (id) => {
      if (!id) return;
      set((state) => ({
        past: state.past.filter((candidate) => candidate.id !== id),
        future: state.future.filter((candidate) => candidate.id !== id),
        revision: state.revision + 1,
      }));
    },
  };
});

export function record(entry: HistoryEntry): number {
  return useHistoryStore.getState().record(entry);
}

/**
 * Drops a recorded change by the id `record` returned, without undoing or redoing it, because
 * something else already reversed it, such as the Undo button on its toast. Safe to call with 0,
 * the id a replay gives back for the change it does not record.
 */
export function retireEntry(id: number): void {
  useHistoryStore.getState().retire(id);
}

export async function undoLast(): Promise<void> {
  if (useHistoryStore.getState().past.length === 0) {
    announce('Nothing to undo.');
    return;
  }
  const label = await useHistoryStore.getState().undo();
  if (label) announce(`Undone: ${label}.`);
}

export async function redoLast(): Promise<void> {
  if (useHistoryStore.getState().future.length === 0) {
    announce('Nothing to redo.');
    return;
  }
  const label = await useHistoryStore.getState().redo();
  if (label) announce(`Redone: ${label}.`);
}

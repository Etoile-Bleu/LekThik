import { create } from 'zustand';

import { ApiError } from './api';
import * as api from './boardsApi';
import type { BoardLook } from './boardLooks';
import type {
  BoardList,
  BoardView,
  CardSummary,
  Label,
  LabelColor,
  PanelConfig,
  PanelKind,
  Priority,
} from './boardsApi';
import { moveCard, moveList, patchCard, removeCard } from './boardModel';
import { notifyError } from './toastStore';
import { useWorkspaceStore } from './workspaceStore';

type BoardStatus = 'idle' | 'loading' | 'ready' | 'notfound' | 'error';

interface LabelInput {
  name: string;
  color: LabelColor;
  priority: Priority;
}

interface BoardState {
  view: BoardView | null;
  status: BoardStatus;
  freshIds: string[];
  load: (boardId: string) => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  renameBoard: (name: string) => Promise<void>;
  setLook: (look: BoardLook) => Promise<void>;
  deleteBoard: () => Promise<boolean>;
  createList: (name: string) => Promise<void>;
  createBlock: (
    kind: Exclude<PanelKind, 'list'>,
    name: string,
    config: PanelConfig
  ) => Promise<BoardList | null>;
  setBlockConfig: (
    blockId: string,
    kind: Exclude<PanelKind, 'list'>,
    config: PanelConfig
  ) => Promise<void>;
  renameList: (listId: string, name: string) => Promise<void>;
  moveList: (listId: string, index: number) => Promise<void>;
  setListWipLimit: (listId: string, limit: number | null) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  createCard: (listId: string, title: string) => Promise<CardSummary | null>;
  renameCard: (cardId: string, title: string) => Promise<void>;
  markHasDescription: (cardId: string, hasDescription: boolean) => void;
  moveCard: (cardId: string, listId: string, index: number) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  setCardLabels: (cardId: string, labelIds: string[]) => Promise<void>;
  setCardAssignees: (cardId: string, userIds: string[]) => Promise<void>;
  setCardDueDate: (cardId: string, day: string | null) => Promise<void>;
  createLabel: (input: LabelInput) => Promise<Label | null>;
  updateLabel: (labelId: string, changes: Partial<LabelInput>) => Promise<void>;
  deleteLabel: (labelId: string) => Promise<void>;
}

const FRESH_LIFETIME_MS = 700;

export const useBoardStore = create<BoardState>((set, get) => {
  const recoverFrom = async (error: unknown) => {
    notifyError(error);
    const current = get().view;
    if (current) {
      await get().load(current.board.id);
    }
  };

  const markFresh = (id: string) => {
    set((state) => ({ freshIds: [...state.freshIds, id] }));
    window.setTimeout(
      () => set((state) => ({ freshIds: state.freshIds.filter((fresh) => fresh !== id) })),
      FRESH_LIFETIME_MS
    );
  };

  const update = (change: (view: BoardView) => BoardView) =>
    set((state) => (state.view ? { view: change(state.view) } : state));

  return {
    view: null,
    status: 'idle',
    freshIds: [],

    load: async (boardId) => {
      if (get().view?.board.id !== boardId) {
        set({ view: null, status: 'loading' });
      }
      try {
        set({ view: await api.fetchBoard(boardId), status: 'ready' });
      } catch (error) {
        const notFound = error instanceof ApiError && error.status === 404;
        set({ status: notFound ? 'notfound' : 'error' });
        if (!notFound) {
          notifyError(error, 'Could not load this board.');
        }
      }
    },

    // Quietly re-reads the open board after someone else changed it. Only a
    // 404 is shown: the board was deleted or this user lost access to it.
    refresh: async () => {
      const current = get().view;
      if (!current) return;
      try {
        const view = await api.fetchBoard(current.board.id);
        if (get().view?.board.id === current.board.id) {
          set({ view, status: 'ready' });
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          set({ view: null, status: 'notfound' });
        }
      }
    },

    reset: () => set({ view: null, status: 'idle', freshIds: [] }),

    renameBoard: async (name) => {
      const view = get().view;
      if (!view) return;
      update((current) => ({ ...current, board: { ...current.board, name } }));
      useWorkspaceStore.getState().syncBoardName(view.board.id, name);
      try {
        await api.renameBoard(view.board.id, name);
      } catch (error) {
        useWorkspaceStore.getState().syncBoardName(view.board.id, view.board.name);
        await recoverFrom(error);
      }
    },

    setLook: async (look) => {
      const view = get().view;
      if (!view) return;
      update((current) => ({ ...current, look }));
      try {
        await api.setBoardLook(view.board.id, look);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    deleteBoard: async () => {
      const view = get().view;
      if (!view) return false;
      try {
        await api.deleteBoard(view.board.id);
        useWorkspaceStore.getState().forgetBoard(view.board.id);
        return true;
      } catch (error) {
        notifyError(error);
        return false;
      }
    },

    createList: async (name) => {
      const view = get().view;
      if (!view) return;
      try {
        const list = await api.createList(view.board.id, name);
        markFresh(list.id);
        update((current) => ({
          ...current,
          lists: [
            ...current.lists,
            { id: list.id, name: list.name, wip_limit: null, kind: 'list', config: {}, cards: [] },
          ],
        }));
      } catch (error) {
        notifyError(error);
      }
    },

    createBlock: async (kind, name, config) => {
      const view = get().view;
      if (!view) return null;
      try {
        const block = await api.createBlock(view.board.id, kind, name, config);
        markFresh(block.id);
        update((current) => ({
          ...current,
          lists: [...current.lists, { ...block, cards: [] }],
        }));
        return block;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    setBlockConfig: async (blockId, kind, config) => {
      update((current) => ({
        ...current,
        lists: current.lists.map((list) => (list.id === blockId ? { ...list, config } : list)),
      }));
      try {
        await api.setBlockConfig(blockId, kind, config);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    renameList: async (listId, name) => {
      update((current) => ({
        ...current,
        lists: current.lists.map((list) => (list.id === listId ? { ...list, name } : list)),
      }));
      try {
        await api.renameList(listId, name);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setListWipLimit: async (listId, limit) => {
      update((current) => ({
        ...current,
        lists: current.lists.map((list) =>
          list.id === listId ? { ...list, wip_limit: limit } : list
        ),
      }));
      try {
        await api.setListWipLimit(listId, limit);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    moveList: async (listId, index) => {
      update((current) => ({ ...current, lists: moveList(current.lists, listId, index) }));
      try {
        await api.moveList(listId, index);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    deleteList: async (listId) => {
      const previous = get().view;
      update((current) => ({
        ...current,
        lists: current.lists.filter((list) => list.id !== listId),
      }));
      try {
        await api.deleteList(listId);
      } catch (error) {
        set({ view: previous });
        notifyError(error);
      }
    },

    createCard: async (listId, title) => {
      try {
        const card = await api.createCard(listId, title);
        markFresh(card.id);
        update((current) => ({
          ...current,
          lists: current.lists.map((list) =>
            list.id === listId ? { ...list, cards: [...list.cards, card] } : list
          ),
        }));
        return card;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    renameCard: async (cardId, title) => {
      update((current) => ({ ...current, lists: patchCard(current.lists, cardId, { title }) }));
      try {
        await api.updateCard(cardId, { title });
      } catch (error) {
        await recoverFrom(error);
      }
    },

    markHasDescription: (cardId, hasDescription) =>
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { has_description: hasDescription }),
      })),

    moveCard: async (cardId, listId, index) => {
      update((current) => ({ ...current, lists: moveCard(current.lists, cardId, listId, index) }));
      try {
        await api.moveCard(cardId, listId, index);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    deleteCard: async (cardId) => {
      const previous = get().view;
      update((current) => ({ ...current, lists: removeCard(current.lists, cardId) }));
      try {
        await api.deleteCard(cardId);
      } catch (error) {
        set({ view: previous });
        notifyError(error);
      }
    },

    setCardLabels: async (cardId, labelIds) => {
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { label_ids: labelIds }),
      }));
      try {
        await api.setCardLabels(cardId, labelIds);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setCardAssignees: async (cardId, userIds) => {
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { assignee_ids: userIds }),
      }));
      try {
        await api.setCardAssignees(cardId, userIds);
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setCardDueDate: async (cardId, day) => {
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { due_date: day }),
      }));
      try {
        await api.updateCard(cardId, { due_date: day });
      } catch (error) {
        await recoverFrom(error);
      }
    },

    createLabel: async (input) => {
      const view = get().view;
      if (!view) return null;
      try {
        const label = await api.createLabel(view.board.id, input);
        update((current) => ({ ...current, labels: sortLabels([...current.labels, label]) }));
        return label;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    updateLabel: async (labelId, changes) => {
      try {
        const label = await api.updateLabel(labelId, changes);
        update((current) => ({
          ...current,
          labels: sortLabels(current.labels.map((entry) => (entry.id === labelId ? label : entry))),
        }));
      } catch (error) {
        notifyError(error);
      }
    },

    deleteLabel: async (labelId) => {
      try {
        await api.deleteLabel(labelId);
        update((current) => ({
          ...current,
          labels: current.labels.filter((label) => label.id !== labelId),
          lists: current.lists.map((list) => ({
            ...list,
            cards: list.cards.map((card) => ({
              ...card,
              label_ids: card.label_ids.filter((id) => id !== labelId),
            })),
          })),
        }));
      } catch (error) {
        notifyError(error);
      }
    },
  };
});

function sortLabels(labels: Label[]): Label[] {
  const rank: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
  return [...labels].sort((a, b) => rank[b.priority] - rank[a.priority]);
}

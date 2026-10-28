import { create } from 'zustand';

import { ApiError } from './api';
import * as api from './boardsApi';
import type { BoardLook } from './boardLooks';
import type {
  BoardList,
  BoardView,
  CardSummary,
  Field,
  FieldValue,
  Label,
  LabelColor,
  PanelConfig,
  PanelKind,
  Priority,
} from './boardsApi';
import { moveCard, moveList, patchCard, removeCard } from './boardModel';
import {
  type CardSnapshot,
  type PanelSnapshot,
  describeCard,
  describeLabel,
  describePanel,
  restoreCard,
  restoreLabel,
  restorePanel,
} from './boardRestore';
import * as fieldsApi from './fieldsApi';
import type { NewFieldInput } from './fieldsApi';
import { patchValues } from './fields';
import * as pollApi from './pollApi';
import { applyVote } from './polls';
import { type Layout, toPlacements } from './grid';
import { alias, isReplaying, record, resolveId, useHistoryStore } from './history';
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
  setImageVersion: (blockId: string, version: number) => void;
  setBlockConfig: (
    blockId: string,
    kind: Exclude<PanelKind, 'list'>,
    config: PanelConfig
  ) => Promise<void>;
  castVote: (listId: string, optionId: string | null) => Promise<boolean>;
  renameList: (listId: string, name: string) => Promise<void>;
  moveList: (listId: string, index: number) => Promise<void>;
  /** Saves where tiles sit on the free layout, showing the new places at once. */
  setLayout: (layout: Layout) => Promise<void>;
  setListWipLimit: (listId: string, limit: number | null) => Promise<void>;
  deleteList: (listId: string) => Promise<void>;
  createCard: (listId: string, title: string) => Promise<CardSummary | null>;
  /** Copies a card right after the original, with its labels, people and date. */
  duplicateCard: (cardId: string) => Promise<CardSummary | null>;
  /** Copies a list with its cards, or a block with its settings. The board is read again to show it. */
  duplicatePanel: (panelId: string) => Promise<string | null>;
  renameCard: (cardId: string, title: string) => Promise<void>;
  markHasDescription: (cardId: string, hasDescription: boolean) => void;
  moveCard: (cardId: string, listId: string, index: number) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;
  setCardLabels: (cardId: string, labelIds: string[]) => Promise<void>;
  setCardAssignees: (cardId: string, userIds: string[]) => Promise<void>;
  setCardDueDate: (cardId: string, day: string | null) => Promise<void>;
  setCardFieldValue: (
    cardId: string,
    fieldId: string,
    value: FieldValue | null
  ) => Promise<boolean>;
  createField: (input: NewFieldInput) => Promise<Field | null>;
  changeField: (
    fieldId: string,
    changes: { name?: string; show_on_card?: boolean; position?: number }
  ) => Promise<boolean>;
  removeField: (fieldId: string) => Promise<boolean>;
  changeOptions: (
    fieldId: string,
    run: (boardId: string) => Promise<Field>
  ) => Promise<Field | null>;
  createLabel: (input: LabelInput) => Promise<Label | null>;
  updateLabel: (labelId: string, changes: Partial<LabelInput>) => Promise<void>;
  deleteLabel: (labelId: string) => Promise<void>;
}

const FRESH_LIFETIME_MS = 700;

export const useBoardStore = create<BoardState>((set, get) => {
  const recoverFrom = async (error: unknown) => {
    if (!isReplaying()) notifyError(error);
    const current = get().view;
    if (current) {
      await get().load(current.board.id);
    }
    if (isReplaying()) throw error;
  };

  const failed = (error: unknown, message?: string) => {
    if (isReplaying()) throw error;
    notifyError(error, message);
  };

  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  const cardNow = (cardId: string) =>
    get()
      .view?.lists.flatMap((list) => list.cards)
      .find((card) => card.id === cardId);

  const placeNow = (cardId: string) => {
    for (const list of get().view?.lists ?? []) {
      const index = list.cards.findIndex((card) => card.id === cardId);
      if (index !== -1) return { listId: list.id, index };
    }
    return null;
  };

  const panelNow = (panelId: string) => get().view?.lists.find((list) => list.id === panelId);

  const recreatePanel = async (snapshot: PanelSnapshot) => {
    const view = get().view;
    if (!view) return;
    const restored = await restorePanel(view.board.id, snapshot);
    alias(snapshot.panel.id, restored.id);
    restored.cards.forEach(([oldId, newId]) => alias(oldId, newId));
    await get().refresh();
  };

  const recreateCard = async (snapshot: CardSnapshot) => {
    const created = await restoreCard(snapshot, resolveId(snapshot.listId));
    alias(snapshot.card.id, created.id);
    await get().refresh();
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
        useHistoryStore.getState().clear();
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

    reset: () => {
      useHistoryStore.getState().clear();
      set({ view: null, status: 'idle', freshIds: [] });
    },

    renameBoard: async (name) => {
      const view = get().view;
      if (!view) return;
      const before = view.board.name;
      update((current) => ({ ...current, board: { ...current.board, name } }));
      useWorkspaceStore.getState().syncBoardName(view.board.id, name);
      try {
        await api.renameBoard(view.board.id, name);
        if (before !== name) {
          record({
            label: 'Rename board',
            undo: () => get().renameBoard(before),
            redo: () => get().renameBoard(name),
          });
        }
      } catch (error) {
        useWorkspaceStore.getState().syncBoardName(view.board.id, view.board.name);
        await recoverFrom(error);
      }
    },

    setLook: async (look) => {
      const view = get().view;
      if (!view) return;
      const before = view.look;
      update((current) => ({ ...current, look }));
      try {
        await api.setBoardLook(view.board.id, look);
        if (!same(before, look)) {
          record({
            label: 'Change the look',
            undo: () => get().setLook(before),
            redo: () => get().setLook(look),
          });
        }
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
        const index = view.lists.length;
        const created: BoardList = {
          id: list.id,
          name: list.name,
          wip_limit: null,
          kind: 'list',
          config: {},
          cards: [],
        };
        update((current) => ({ ...current, lists: [...current.lists, created] }));
        record({
          label: 'Add list',
          undo: () => get().deleteList(resolveId(created.id)),
          redo: () => recreatePanel({ panel: created, index, cards: [] }),
        });
      } catch (error) {
        failed(error);
      }
    },

    createBlock: async (kind, name, config) => {
      const view = get().view;
      if (!view) return null;
      try {
        const block = await api.createBlock(view.board.id, kind, name, config);
        markFresh(block.id);
        const index = view.lists.length;
        update((current) => ({
          ...current,
          lists: [...current.lists, { ...block, cards: [] }],
        }));
        record({
          label: 'Add block',
          undo: () => get().deleteList(resolveId(block.id)),
          redo: () => recreatePanel({ panel: { ...block, cards: [] }, index, cards: [] }),
        });
        return block;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    setImageVersion: (blockId, version) => {
      update((current) => ({
        ...current,
        lists: current.lists.map((list) =>
          list.id === blockId ? { ...list, image_version: version } : list
        ),
      }));
    },

    setBlockConfig: async (blockId, kind, config) => {
      const before = panelNow(blockId)?.config;
      update((current) => ({
        ...current,
        lists: current.lists.map((list) => (list.id === blockId ? { ...list, config } : list)),
      }));
      try {
        await api.setBlockConfig(blockId, kind, config);
        if (before !== undefined && kind !== 'timer' && !same(before, config)) {
          record({
            label: 'Change block',
            undo: () => get().setBlockConfig(resolveId(blockId), kind, before),
            redo: () => get().setBlockConfig(resolveId(blockId), kind, config),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    castVote: async (listId, optionId) => {
      const before = get().view?.polls;
      const previous = before?.find((entry) => entry.list_id === listId)?.mine ?? null;
      const place = (next: string | null) =>
        update((current) => {
          const polls = current.polls ?? [];
          const tally = applyVote(
            polls.find((entry) => entry.list_id === listId),
            listId,
            next
          );
          return {
            ...current,
            polls: [...polls.filter((entry) => entry.list_id !== listId), tally],
          };
        });
      place(optionId);
      try {
        await (optionId === null
          ? pollApi.withdrawVote(listId)
          : pollApi.castVote(listId, optionId));
        if (previous !== optionId) {
          const apply = async (option: string | null) => {
            if (!(await get().castVote(resolveId(listId), option))) {
              throw new Error('The vote could not be saved.');
            }
          };
          record({
            label: optionId === null ? 'Remove vote' : 'Vote',
            undo: () => apply(previous),
            redo: () => apply(optionId),
          });
        }
        return true;
      } catch (error) {
        update((current) => ({ ...current, polls: before ?? [] }));
        if (!isReplaying()) notifyError(error, 'The vote could not be saved.');
        await get().refresh();
        return false;
      }
    },

    renameList: async (listId, name) => {
      const before = panelNow(listId)?.name;
      update((current) => ({
        ...current,
        lists: current.lists.map((list) => (list.id === listId ? { ...list, name } : list)),
      }));
      try {
        await api.renameList(listId, name);
        if (before !== undefined && before !== name) {
          record({
            label: 'Rename',
            undo: () => get().renameList(resolveId(listId), before),
            redo: () => get().renameList(resolveId(listId), name),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setListWipLimit: async (listId, limit) => {
      const before = panelNow(listId)?.wip_limit;
      update((current) => ({
        ...current,
        lists: current.lists.map((list) =>
          list.id === listId ? { ...list, wip_limit: limit } : list
        ),
      }));
      try {
        await api.setListWipLimit(listId, limit);
        if (before !== undefined && before !== limit) {
          record({
            label: 'Change the limit',
            undo: () => get().setListWipLimit(resolveId(listId), before),
            redo: () => get().setListWipLimit(resolveId(listId), limit),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    moveList: async (listId, index) => {
      const before = get().view?.lists.findIndex((list) => list.id === listId) ?? -1;
      update((current) => ({ ...current, lists: moveList(current.lists, listId, index) }));
      try {
        await api.moveList(listId, index);
        if (before !== -1 && before !== index) {
          record({
            label: 'Move',
            undo: () => get().moveList(resolveId(listId), before),
            redo: () => get().moveList(resolveId(listId), index),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setLayout: async (layout) => {
      const view = get().view;
      if (!view) return;
      const items = toPlacements(layout);
      const before: Layout = {};
      for (const list of view.lists) {
        if (layout[list.id] && list.layout) before[list.id] = { ...list.layout };
      }
      update((current) => ({
        ...current,
        lists: current.lists.map((list) =>
          layout[list.id] ? { ...list, layout: { ...layout[list.id] } } : list
        ),
      }));
      try {
        await api.setBoardLayout(view.board.id, items);
        if (Object.keys(before).length > 0 && !same(before, pick(layout, Object.keys(before)))) {
          record({
            label: 'Change the layout',
            undo: () => get().setLayout(before),
            redo: () => get().setLayout(layout),
          });
        }
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
        const snapshot =
          previous && !isReplaying()
            ? await describePanel(previous, listId).catch(() => null)
            : null;
        await api.deleteList(listId);
        if (snapshot && snapshot.panel.kind !== 'image') {
          record({
            label: snapshot.panel.kind === 'list' ? 'Delete list' : 'Delete block',
            undo: () => recreatePanel(snapshot),
            redo: () => get().deleteList(resolveId(snapshot.panel.id)),
          });
        }
      } catch (error) {
        set({ view: previous });
        failed(error);
      }
    },

    createCard: async (listId, title) => {
      try {
        const index = panelNow(listId)?.cards.length ?? 0;
        const card = await api.createCard(listId, title);
        markFresh(card.id);
        update((current) => ({
          ...current,
          lists: current.lists.map((list) =>
            list.id === listId ? { ...list, cards: [...list.cards, card] } : list
          ),
        }));
        record({
          label: 'Add card',
          undo: () => get().deleteCard(resolveId(card.id)),
          redo: () => recreateCard({ card, listId, index, description: '', values: [] }),
        });
        return card;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    duplicateCard: async (cardId) => {
      try {
        const card = await api.duplicateCard(cardId);
        markFresh(card.id);
        record({
          label: 'Duplicate card',
          undo: () => get().deleteCard(resolveId(card.id)),
          redo: async () => {
            const again = await api.duplicateCard(resolveId(cardId));
            alias(card.id, again.id);
            await get().refresh();
          },
        });
        update((current) => ({
          ...current,
          lists: current.lists.map((list) => {
            if (list.id !== card.list_id) return list;
            const at = list.cards.findIndex((item) => item.id === cardId);
            const cards = [...list.cards];
            cards.splice(at === -1 ? cards.length : at + 1, 0, card);
            return { ...list, cards };
          }),
        }));
        return card;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    duplicatePanel: async (panelId) => {
      try {
        const copy = await api.duplicatePanel(panelId);
        await get().refresh();
        markFresh(copy.id);
        record({
          label: 'Duplicate',
          undo: () => get().deleteList(resolveId(copy.id)),
          redo: async () => {
            const again = await api.duplicatePanel(resolveId(panelId));
            alias(copy.id, again.id);
            await get().refresh();
          },
        });
        return copy.id;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    renameCard: async (cardId, title) => {
      const before = cardNow(cardId)?.title;
      update((current) => ({ ...current, lists: patchCard(current.lists, cardId, { title }) }));
      try {
        await api.updateCard(cardId, { title });
        if (before !== undefined && before !== title) {
          record({
            label: 'Rename card',
            undo: () => get().renameCard(resolveId(cardId), before),
            redo: () => get().renameCard(resolveId(cardId), title),
          });
        }
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
      const before = placeNow(cardId);
      update((current) => ({ ...current, lists: moveCard(current.lists, cardId, listId, index) }));
      const after = placeNow(cardId);
      try {
        await api.moveCard(cardId, listId, index);
        if (before && after && (before.listId !== after.listId || before.index !== after.index)) {
          record({
            label: 'Move card',
            undo: () => get().moveCard(resolveId(cardId), resolveId(before.listId), before.index),
            redo: () => get().moveCard(resolveId(cardId), resolveId(listId), index),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    deleteCard: async (cardId) => {
      const previous = get().view;
      update((current) => ({ ...current, lists: removeCard(current.lists, cardId) }));
      try {
        const snapshot =
          previous && !isReplaying()
            ? await describeCard(previous, cardId).catch(() => null)
            : null;
        await api.deleteCard(cardId);
        if (snapshot) {
          record({
            label: 'Delete card',
            undo: () => recreateCard(snapshot),
            redo: () => get().deleteCard(resolveId(snapshot.card.id)),
          });
        }
      } catch (error) {
        set({ view: previous });
        failed(error);
      }
    },

    setCardLabels: async (cardId, labelIds) => {
      const before = cardNow(cardId)?.label_ids;
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { label_ids: labelIds }),
      }));
      try {
        await api.setCardLabels(cardId, labelIds);
        if (before !== undefined && !same(before, labelIds)) {
          record({
            label: 'Change labels',
            undo: () => get().setCardLabels(resolveId(cardId), before.map(resolveId)),
            redo: () => get().setCardLabels(resolveId(cardId), labelIds.map(resolveId)),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setCardAssignees: async (cardId, userIds) => {
      const before = cardNow(cardId)?.assignee_ids;
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { assignee_ids: userIds }),
      }));
      try {
        await api.setCardAssignees(cardId, userIds);
        if (before !== undefined && !same(before, userIds)) {
          record({
            label: 'Change people',
            undo: () => get().setCardAssignees(resolveId(cardId), before),
            redo: () => get().setCardAssignees(resolveId(cardId), userIds),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setCardDueDate: async (cardId, day) => {
      const before = cardNow(cardId)?.due_date;
      update((current) => ({
        ...current,
        lists: patchCard(current.lists, cardId, { due_date: day }),
      }));
      try {
        await api.updateCard(cardId, { due_date: day });
        if (before !== undefined && before !== day) {
          record({
            label: 'Change date',
            undo: () => get().setCardDueDate(resolveId(cardId), before),
            redo: () => get().setCardDueDate(resolveId(cardId), day),
          });
        }
      } catch (error) {
        await recoverFrom(error);
      }
    },

    setCardFieldValue: async (cardId, fieldId, value) => {
      const before = get().view?.field_values;
      const previous =
        before?.find((entry) => entry.card_id === cardId && entry.field_id === fieldId)?.value ??
        null;
      update((current) => ({
        ...current,
        field_values: patchValues(current.field_values, cardId, fieldId, value),
      }));
      try {
        const saved = await fieldsApi.setFieldValue(cardId, fieldId, value);
        update((current) => ({
          ...current,
          field_values: patchValues(current.field_values, cardId, fieldId, saved),
        }));
        if (!same(previous, value)) {
          const apply = async (next: FieldValue | null) => {
            if (!(await get().setCardFieldValue(resolveId(cardId), fieldId, next))) {
              throw new Error('The value could not be saved.');
            }
          };
          record({
            label: 'Change field',
            undo: () => apply(previous),
            redo: () => apply(value),
          });
        }
        return true;
      } catch (error) {
        update((current) => ({ ...current, field_values: before ?? [] }));
        if (!isReplaying()) notifyError(error, 'The value could not be saved.');
        return false;
      }
    },

    createField: async (input) => {
      const view = get().view;
      if (!view) return null;
      try {
        const field = await fieldsApi.createField(view.board.id, input);
        update((current) => ({ ...current, fields: [...(current.fields ?? []), field] }));
        return field;
      } catch (error) {
        notifyError(error, 'The field could not be added.');
        return null;
      }
    },

    changeField: async (fieldId, changes) => {
      const view = get().view;
      if (!view) return false;
      try {
        await fieldsApi.updateField(view.board.id, fieldId, changes);
        await get().refresh();
        return true;
      } catch (error) {
        notifyError(error, 'The field could not be changed.');
        return false;
      }
    },

    removeField: async (fieldId) => {
      const view = get().view;
      if (!view) return false;
      try {
        await fieldsApi.deleteField(view.board.id, fieldId);
        update((current) => ({
          ...current,
          fields: (current.fields ?? []).filter((field) => field.id !== fieldId),
          field_values: (current.field_values ?? []).filter((entry) => entry.field_id !== fieldId),
        }));
        return true;
      } catch (error) {
        notifyError(error, 'The field could not be deleted.');
        return false;
      }
    },

    changeOptions: async (fieldId, run) => {
      const view = get().view;
      if (!view) return null;
      try {
        const field = await run(view.board.id);
        const known = new Set(field.options.map((option) => option.id));
        update((current) => ({
          ...current,
          fields: (current.fields ?? []).map((entry) => (entry.id === fieldId ? field : entry)),
          field_values: (current.field_values ?? []).filter((entry) => {
            const owner = (current.fields ?? []).find(
              (candidate) => candidate.id === entry.field_id
            );
            return !(
              entry.field_id === fieldId &&
              owner?.kind === 'select' &&
              !known.has(String(entry.value))
            );
          }),
        }));
        return field;
      } catch (error) {
        notifyError(error, 'The choices could not be changed.');
        return null;
      }
    },

    createLabel: async (input) => {
      const view = get().view;
      if (!view) return null;
      try {
        const label = await api.createLabel(view.board.id, input);
        update((current) => ({ ...current, labels: sortLabels([...current.labels, label]) }));
        record({
          label: 'Add label',
          undo: () => get().deleteLabel(resolveId(label.id)),
          redo: async () => {
            const id = await restoreLabel(view.board.id, { label, cardIds: [] });
            alias(label.id, id);
            await get().refresh();
          },
        });
        return label;
      } catch (error) {
        notifyError(error);
        return null;
      }
    },

    updateLabel: async (labelId, changes) => {
      const existing = get().view?.labels.find((entry) => entry.id === labelId);
      try {
        const label = await api.updateLabel(labelId, changes);
        update((current) => ({
          ...current,
          labels: sortLabels(current.labels.map((entry) => (entry.id === labelId ? label : entry))),
        }));
        if (existing) {
          const before: Partial<LabelInput> = {};
          for (const key of Object.keys(changes) as Array<keyof LabelInput>) {
            Object.assign(before, { [key]: existing[key] });
          }
          if (!same(before, changes)) {
            record({
              label: 'Edit label',
              undo: () => get().updateLabel(resolveId(labelId), before),
              redo: () => get().updateLabel(resolveId(labelId), changes),
            });
          }
        }
      } catch (error) {
        failed(error);
      }
    },

    deleteLabel: async (labelId) => {
      const view = get().view;
      const snapshot = view && !isReplaying() ? describeLabel(view, labelId) : null;
      try {
        await api.deleteLabel(labelId);
        if (snapshot && view) {
          record({
            label: 'Delete label',
            undo: async () => {
              const id = await restoreLabel(view.board.id, snapshot);
              alias(labelId, id);
              await get().refresh();
            },
            redo: () => get().deleteLabel(resolveId(labelId)),
          });
        }
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
        failed(error);
      }
    },
  };
});

function pick(layout: Layout, ids: string[]): Layout {
  const picked: Layout = {};
  for (const id of ids) {
    if (layout[id]) picked[id] = layout[id];
  }
  return picked;
}

function sortLabels(labels: Label[]): Label[] {
  const rank: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
  return [...labels].sort((a, b) => rank[b.priority] - rank[a.priority]);
}

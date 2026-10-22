import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./boardsApi', () => ({
  fetchBoard: vi.fn(),
  renameBoard: vi.fn(),
  deleteBoard: vi.fn(),
  createList: vi.fn(),
  renameList: vi.fn(),
  moveList: vi.fn(),
  deleteList: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  moveCard: vi.fn(),
  deleteCard: vi.fn(),
  setCardLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}));

import { ApiError } from './api';
import * as api from './boardsApi';
import type { BoardView } from './boardsApi';
import { useBoardStore } from './boardStore';
import { useToastStore } from './toastStore';

function sampleView(): BoardView {
  return {
    board: { id: 'b1', workspace_id: 'w1', name: 'Roadmap' },
    role: 'owner',
    look: { background: 'default', accent: 'teal' },
    members: [
      { user_id: 'u-me', username: 'amir' },
      { user_id: 'u-wen', username: 'wen' },
    ],
    lists: [
      {
        id: 'todo',
        name: 'To do',
        cards: [
          {
            id: 'a',
            list_id: 'todo',
            title: 'A',
            has_description: false,
            description_preview: '',
            label_ids: ['urgent'],
            assignee_ids: [],
            due_date: null,
          },
          {
            id: 'b',
            list_id: 'todo',
            title: 'B',
            has_description: false,
            description_preview: '',
            label_ids: [],
            assignee_ids: [],
            due_date: null,
          },
        ],
      },
      { id: 'done', name: 'Done', cards: [] },
    ],
    labels: [
      { id: 'urgent', board_id: 'b1', name: 'Urgent', color: 'red', priority: 'urgent' },
      { id: 'low', board_id: 'b1', name: 'Low', color: 'blue', priority: 'low' },
    ],
  };
}

const cardIds = (listIndex: number) =>
  useBoardStore.getState().view?.lists[listIndex].cards.map((card) => card.id);

describe('useBoardStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useBoardStore.getState().reset();
    useToastStore.setState({ toasts: [] });
    useBoardStore.setState({ view: sampleView(), status: 'ready' });
  });

  it('loads a board', async () => {
    useBoardStore.getState().reset();
    vi.mocked(api.fetchBoard).mockResolvedValueOnce(sampleView());

    await useBoardStore.getState().load('b1');

    expect(useBoardStore.getState().status).toBe('ready');
    expect(useBoardStore.getState().view?.board.name).toBe('Roadmap');
  });

  it('flags a board that does not exist', async () => {
    useBoardStore.getState().reset();
    vi.mocked(api.fetchBoard).mockRejectedValueOnce(new ApiError(404, 'not found'));

    await useBoardStore.getState().load('missing');

    expect(useBoardStore.getState().status).toBe('notfound');
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('moves a card optimistically before the server answers', async () => {
    vi.mocked(api.moveCard).mockResolvedValueOnce(undefined);

    const pending = useBoardStore.getState().moveCard('a', 'done', 0);

    expect(cardIds(0)).toEqual(['b']);
    expect(cardIds(1)).toEqual(['a']);
    await pending;
    expect(api.moveCard).toHaveBeenCalledWith('a', 'done', 0);
  });

  it('reloads the board and warns when a move is refused', async () => {
    vi.mocked(api.moveCard).mockRejectedValueOnce(new Error('not found'));
    vi.mocked(api.fetchBoard).mockResolvedValueOnce(sampleView());

    await useBoardStore.getState().moveCard('a', 'done', 0);

    expect(cardIds(0)).toEqual(['a', 'b']);
    expect(useToastStore.getState().toasts[0]?.tone).toBe('error');
  });

  it('appends a created card and marks it fresh for the entrance animation', async () => {
    vi.mocked(api.createCard).mockResolvedValueOnce({
      id: 'c',
      list_id: 'done',
      title: 'C',
      has_description: false,
      description_preview: '',
      label_ids: [],
      assignee_ids: [],
      due_date: null,
    });

    const created = await useBoardStore.getState().createCard('done', 'C');

    expect(created?.id).toBe('c');
    expect(cardIds(1)).toEqual(['c']);
    expect(useBoardStore.getState().freshIds).toContain('c');
  });

  it('removes a deleted card and restores it when the server refuses', async () => {
    vi.mocked(api.deleteCard).mockRejectedValueOnce(new Error('nope'));

    await useBoardStore.getState().deleteCard('a');

    expect(cardIds(0)).toEqual(['a', 'b']);
  });

  it('strips a deleted label from the board and from every card', async () => {
    vi.mocked(api.deleteLabel).mockResolvedValueOnce(undefined);

    await useBoardStore.getState().deleteLabel('urgent');

    const view = useBoardStore.getState().view;
    expect(view?.labels.map((label) => label.id)).toEqual(['low']);
    expect(view?.lists[0].cards[0].label_ids).toEqual([]);
  });

  it('keeps labels ordered from the most to the least urgent', async () => {
    vi.mocked(api.createLabel).mockResolvedValueOnce({
      id: 'high',
      board_id: 'b1',
      name: 'High',
      color: 'orange',
      priority: 'high',
    });

    await useBoardStore.getState().createLabel({ name: 'High', color: 'orange', priority: 'high' });

    expect(useBoardStore.getState().view?.labels.map((label) => label.id)).toEqual([
      'urgent',
      'high',
      'low',
    ]);
  });

  it('reorders lists optimistically', async () => {
    vi.mocked(api.moveList).mockResolvedValueOnce(undefined);

    await useBoardStore.getState().moveList('done', 0);

    expect(useBoardStore.getState().view?.lists.map((list) => list.id)).toEqual(['done', 'todo']);
  });
});

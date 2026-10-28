import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./boardsApi', () => ({
  fetchBoard: vi.fn(),
  fetchCard: vi.fn(),
  renameBoard: vi.fn(),
  setBoardLook: vi.fn(),
  deleteBoard: vi.fn(),
  createList: vi.fn(),
  renameList: vi.fn(),
  setListWipLimit: vi.fn(),
  moveList: vi.fn(),
  setBoardLayout: vi.fn(),
  deleteList: vi.fn(),
  createCard: vi.fn(),
  duplicateCard: vi.fn(),
  updateCard: vi.fn(),
  moveCard: vi.fn(),
  deleteCard: vi.fn(),
  setCardLabels: vi.fn(),
  setCardAssignees: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
}));
vi.mock('./fieldsApi', () => ({ setFieldValue: vi.fn() }));

import * as api from './boardsApi';
import { recordDescription } from './cardDescription';
import { useBoardStore } from './boardStore';
import * as fieldsApi from './fieldsApi';
import { useHistoryStore } from './history';
import { sampleBoardView } from '../../test/fixtures';

const card = (id: string, extra = {}) => ({
  id,
  list_id: 'todo',
  title: id.toUpperCase(),
  has_description: false,
  description_preview: '',
  label_ids: [],
  assignee_ids: [],
  due_date: null,
  ...extra,
});

function view() {
  return {
    ...sampleBoardView(),
    lists: [
      {
        id: 'todo',
        name: 'To do',
        wip_limit: 3,
        kind: 'list' as const,
        config: {},
        cards: [card('a', { label_ids: ['urgent'], has_description: true }), card('b')],
      },
      { id: 'done', name: 'Done', wip_limit: null, kind: 'list' as const, config: {}, cards: [] },
    ],
  };
}

const titles = (listId: string) =>
  useBoardStore
    .getState()
    .view?.lists.find((list) => list.id === listId)
    ?.cards.map((entry) => entry.title);

const undo = () => useHistoryStore.getState().undo();
const redo = () => useHistoryStore.getState().redo();

describe('undo and redo of board changes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useHistoryStore.getState().clear();
    useBoardStore.setState({ view: view(), status: 'ready', freshIds: [] });
    vi.mocked(api.fetchBoard).mockImplementation(async () => view());
  });

  it('undoes and redoes a rename of a card', async () => {
    vi.mocked(api.updateCard).mockResolvedValue({} as never);

    await useBoardStore.getState().renameCard('a', 'Renamed');
    expect(titles('todo')).toEqual(['Renamed', 'B']);

    await undo();
    expect(titles('todo')).toEqual(['A', 'B']);
    expect(api.updateCard).toHaveBeenLastCalledWith('a', { title: 'A' });

    await redo();
    expect(titles('todo')).toEqual(['Renamed', 'B']);
  });

  it('does not record a rename that changes nothing', async () => {
    vi.mocked(api.updateCard).mockResolvedValue({} as never);

    await useBoardStore.getState().renameCard('a', 'A');

    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it('does not record a change the server refused', async () => {
    vi.mocked(api.updateCard).mockRejectedValue(new Error('no'));

    await useBoardStore.getState().renameCard('a', 'Nope');

    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it('puts a moved card back where it was, to the very place', async () => {
    vi.mocked(api.moveCard).mockResolvedValue(undefined);

    await useBoardStore.getState().moveCard('a', 'done', 0);
    expect(titles('done')).toEqual(['A']);

    await undo();
    expect(titles('todo')).toEqual(['A', 'B']);
    expect(api.moveCard).toHaveBeenLastCalledWith('a', 'todo', 0);

    await redo();
    expect(titles('done')).toEqual(['A']);
  });

  it('undoes labels, people, dates and the limit of a list', async () => {
    vi.mocked(api.setCardLabels).mockResolvedValue({ label_ids: [] });
    vi.mocked(api.setCardAssignees).mockResolvedValue({ assignee_ids: [] });
    vi.mocked(api.updateCard).mockResolvedValue({} as never);
    vi.mocked(api.setListWipLimit).mockResolvedValue({ id: 'todo' } as never);
    const store = useBoardStore.getState();

    await store.setCardLabels('a', []);
    await store.setCardAssignees('a', ['u-me']);
    await store.setCardDueDate('a', '2026-11-01');
    await store.setListWipLimit('todo', null);

    await undo();
    expect(api.setListWipLimit).toHaveBeenLastCalledWith('todo', 3);
    await undo();
    expect(api.updateCard).toHaveBeenLastCalledWith('a', { due_date: null });
    await undo();
    expect(api.setCardAssignees).toHaveBeenLastCalledWith('a', []);
    await undo();
    expect(api.setCardLabels).toHaveBeenLastCalledWith('a', ['urgent']);
    expect(useHistoryStore.getState().future).toHaveLength(4);
  });

  it('removes a card it just created, and brings it back with redo', async () => {
    vi.mocked(api.createCard).mockResolvedValueOnce(card('n'));
    vi.mocked(api.deleteCard).mockResolvedValue(undefined);
    await useBoardStore.getState().createCard('todo', 'N');
    expect(titles('todo')).toEqual(['A', 'B', 'N']);

    await undo();
    expect(api.deleteCard).toHaveBeenCalledWith('n');
    expect(titles('todo')).toEqual(['A', 'B']);

    vi.mocked(api.createCard).mockResolvedValueOnce(card('n2', { title: 'N' }));
    vi.mocked(api.moveCard).mockResolvedValue(undefined);
    await redo();
    expect(api.createCard).toHaveBeenLastCalledWith('todo', 'N');
    expect(api.moveCard).toHaveBeenLastCalledWith('n2', 'todo', 2);
  });

  it('restores a deleted card with its labels, date and description', async () => {
    vi.mocked(api.fetchCard).mockResolvedValue({ description: 'Some **words**' } as never);
    vi.mocked(api.deleteCard).mockResolvedValue(undefined);
    await useBoardStore.getState().deleteCard('a');
    expect(titles('todo')).toEqual(['B']);

    vi.mocked(api.createCard).mockResolvedValue(card('a2', { title: 'A' }));
    vi.mocked(api.moveCard).mockResolvedValue(undefined);
    vi.mocked(api.setCardLabels).mockResolvedValue({ label_ids: ['urgent'] });
    vi.mocked(api.updateCard).mockResolvedValue({} as never);
    await undo();

    expect(api.createCard).toHaveBeenCalledWith('todo', 'A');
    expect(api.moveCard).toHaveBeenCalledWith('a2', 'todo', 0);
    expect(api.setCardLabels).toHaveBeenCalledWith('a2', ['urgent']);
    expect(api.updateCard).toHaveBeenCalledWith('a2', { description: 'Some **words**' });
  });

  it('keeps earlier changes working on a card that was deleted and restored', async () => {
    vi.mocked(api.updateCard).mockResolvedValue({} as never);
    vi.mocked(api.deleteCard).mockResolvedValue(undefined);
    await useBoardStore.getState().renameCard('b', 'Changed');
    await useBoardStore.getState().deleteCard('b');

    vi.mocked(api.createCard).mockResolvedValue(card('b2', { title: 'Changed' }));
    vi.mocked(api.moveCard).mockResolvedValue(undefined);
    await undo();
    vi.mocked(api.updateCard).mockClear();
    await undo();

    expect(api.updateCard).toHaveBeenCalledWith('b2', { title: 'B' });
  });

  it('restores a deleted list with its cards', async () => {
    vi.mocked(api.deleteList).mockResolvedValue(undefined);
    vi.mocked(api.fetchCard).mockResolvedValue({ description: '' } as never);
    await useBoardStore.getState().deleteList('todo');

    vi.mocked(api.createList).mockResolvedValue({ id: 'todo2', name: 'To do' } as never);
    vi.mocked(api.setListWipLimit).mockResolvedValue({ id: 'todo2' } as never);
    vi.mocked(api.moveList).mockResolvedValue(undefined);
    vi.mocked(api.createCard)
      .mockResolvedValueOnce(card('a2', { list_id: 'todo2' }))
      .mockResolvedValueOnce(card('b2', { list_id: 'todo2' }));
    vi.mocked(api.moveCard).mockResolvedValue(undefined);
    vi.mocked(api.setCardLabels).mockResolvedValue({ label_ids: [] });
    await undo();

    expect(api.createList).toHaveBeenCalledWith('b1', 'To do');
    expect(api.setListWipLimit).toHaveBeenCalledWith('todo2', 3);
    expect(api.moveList).toHaveBeenCalledWith('todo2', 0);
    expect(api.createCard).toHaveBeenNthCalledWith(1, 'todo2', 'A');
    expect(api.createCard).toHaveBeenNthCalledWith(2, 'todo2', 'B');
  });

  it('puts a deleted label back on the cards that had it', async () => {
    vi.mocked(api.deleteLabel).mockResolvedValue(undefined);
    await useBoardStore.getState().deleteLabel('urgent');
    const afterDelete = view();
    afterDelete.lists[0].cards[0].label_ids = [];
    vi.mocked(api.fetchBoard).mockResolvedValue(afterDelete);

    vi.mocked(api.createLabel).mockResolvedValue({
      id: 'urgent2',
      board_id: 'b1',
      name: 'Urgent',
      color: 'red',
      priority: 'urgent',
    });
    vi.mocked(api.setCardLabels).mockResolvedValue({ label_ids: [] });
    await undo();

    expect(api.createLabel).toHaveBeenCalledWith('b1', {
      name: 'Urgent',
      color: 'red',
      priority: 'urgent',
    });
    expect(api.setCardLabels).toHaveBeenCalledWith('a', ['urgent2']);
  });

  it('sets a custom field back to what it held', async () => {
    useBoardStore.setState({
      view: { ...view(), field_values: [{ card_id: 'a', field_id: 'f1', value: 'old' }] },
    });
    vi.mocked(fieldsApi.setFieldValue).mockImplementation(async (_card, _field, value) => value);

    await useBoardStore.getState().setCardFieldValue('a', 'f1', 'new');
    await undo();

    expect(fieldsApi.setFieldValue).toHaveBeenLastCalledWith('a', 'f1', 'old');
  });

  it('edits a description back and forth', async () => {
    vi.mocked(api.updateCard).mockImplementation(
      async (_id, changes) => ({ id: 'a', description: changes.description ?? '' }) as never
    );

    recordDescription('a', 'before', 'after');
    await undo();
    expect(api.updateCard).toHaveBeenLastCalledWith('a', { description: 'before' });
    await redo();
    expect(api.updateCard).toHaveBeenLastCalledWith('a', { description: 'after' });
    expect(useBoardStore.getState().view?.lists[0].cards[0].has_description).toBe(true);
  });

  it('forgets everything when another board opens', async () => {
    vi.mocked(api.updateCard).mockResolvedValue({} as never);
    await useBoardStore.getState().renameCard('a', 'X');
    expect(useHistoryStore.getState().past).toHaveLength(1);

    vi.mocked(api.fetchBoard).mockResolvedValue({
      ...view(),
      board: { id: 'b2', workspace_id: 'w1', name: 'Other' },
    });
    await useBoardStore.getState().load('b2');

    expect(useHistoryStore.getState().past).toHaveLength(0);
  });

  it('keeps the same board when it only reloads after an error', async () => {
    vi.mocked(api.updateCard).mockResolvedValueOnce({} as never);
    await useBoardStore.getState().renameCard('a', 'X');

    await useBoardStore.getState().load('b1');

    expect(useHistoryStore.getState().past).toHaveLength(1);
  });

  it('reports a change that cannot be undone because the card is gone', async () => {
    vi.mocked(api.updateCard).mockResolvedValueOnce({} as never);
    await useBoardStore.getState().renameCard('a', 'X');
    vi.mocked(api.updateCard).mockRejectedValueOnce(new Error('gone'));

    expect(await undo()).toBeNull();

    expect(useHistoryStore.getState().past).toHaveLength(0);
    expect(useHistoryStore.getState().busy).toBe(false);
  });
});

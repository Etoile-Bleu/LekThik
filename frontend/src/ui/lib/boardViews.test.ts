import { describe, expect, it } from 'vitest';

import type { BoardList, Label } from './boardsApi';
import { buildRows, describeSort, nextSort, sortRows } from './boardViews';

function card(id: string, title: string, extra: Partial<BoardList['cards'][number]> = {}) {
  return {
    id,
    list_id: 'l1',
    title,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: null,
    ...extra,
  };
}

const labels: Label[] = [
  { id: 'low', board_id: 'b', name: 'Low', color: 'blue', priority: 'low' },
  { id: 'urgent', board_id: 'b', name: 'Urgent', color: 'red', priority: 'urgent' },
];
const members = [
  { user_id: 'u1', username: 'wen' },
  { user_id: 'u2', username: 'amir' },
];
const lists: BoardList[] = [
  {
    id: 'l1',
    name: 'To do',
    wip_limit: null,
    cards: [
      card('a', 'Banana', { due_date: '2026-11-02', label_ids: ['low'], assignee_ids: ['u1'] }),
      card('b', 'apple', { due_date: null, label_ids: ['urgent'] }),
      card('c', 'Cherry 10', { due_date: '2026-10-30', assignee_ids: ['u2'] }),
    ],
  },
  {
    id: 'l2',
    name: 'Done',
    wip_limit: null,
    cards: [card('d', 'Cherry 2', { due_date: '2026-10-30' })],
  },
];

const rows = buildRows(lists, labels, members);
const ids = (sorted: typeof rows) => sorted.map((row) => row.card.id);

describe('board rows', () => {
  it('carries the list, labels and assignee names of each card in board order', () => {
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows[0].listName).toBe('To do');
    expect(rows[3].listName).toBe('Done');
    expect(rows[0].labels.map((label) => label.name)).toEqual(['Low']);
    expect(rows[0].assigneeNames).toEqual(['wen']);
  });

  it('names an assignee who has left', () => {
    const built = buildRows(
      [
        {
          id: 'l',
          name: 'L',
          wip_limit: null,
          cards: [card('x', 'X', { assignee_ids: ['gone'] })],
        },
      ],
      [],
      []
    );
    expect(built[0].assigneeNames).toEqual(['Former member']);
  });
});

describe('sorting', () => {
  it('keeps the board order without a sort', () => {
    expect(ids(sortRows(rows, null))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts titles without caring about case and reads numbers as numbers', () => {
    expect(ids(sortRows(rows, { key: 'title', direction: 'asc' }))).toEqual(['b', 'a', 'd', 'c']);
    expect(ids(sortRows(rows, { key: 'title', direction: 'desc' }))).toEqual(['c', 'd', 'a', 'b']);
  });

  it('puts cards with no due date last either way', () => {
    expect(ids(sortRows(rows, { key: 'due', direction: 'asc' }))).toEqual(['c', 'd', 'a', 'b']);
    expect(ids(sortRows(rows, { key: 'due', direction: 'desc' }))).toEqual(['a', 'c', 'd', 'b']);
  });

  it('puts unassigned cards last either way', () => {
    expect(ids(sortRows(rows, { key: 'assignees', direction: 'asc' }))[0]).toBe('c');
    expect(ids(sortRows(rows, { key: 'assignees', direction: 'asc' })).slice(-2)).toEqual([
      'b',
      'd',
    ]);
    expect(ids(sortRows(rows, { key: 'assignees', direction: 'desc' }))[0]).toBe('a');
  });

  it('sorts labels by their highest priority, most urgent first', () => {
    expect(ids(sortRows(rows, { key: 'labels', direction: 'asc' })).slice(0, 2)).toEqual([
      'b',
      'a',
    ]);
  });

  it('sorts by list in board order and reverses it', () => {
    expect(ids(sortRows(rows, { key: 'list', direction: 'desc' }))).toEqual(['d', 'c', 'b', 'a']);
  });

  it('never changes the rows it is given', () => {
    const before = ids(rows);
    sortRows(rows, { key: 'title', direction: 'desc' });
    expect(ids(rows)).toEqual(before);
  });

  it('breaks ties by board order so the result is stable', () => {
    const sorted = sortRows(rows, { key: 'due', direction: 'asc' });
    expect(ids(sorted).slice(0, 2)).toEqual(['c', 'd']);
  });
});

describe('the sort cycle', () => {
  it('goes ascending, descending, then back to the board order', () => {
    const first = nextSort(null, 'due');
    expect(first).toEqual({ key: 'due', direction: 'asc' });
    const second = nextSort(first, 'due');
    expect(second).toEqual({ key: 'due', direction: 'desc' });
    expect(nextSort(second, 'due')).toBeNull();
  });

  it('starts again at ascending when another column is chosen', () => {
    expect(nextSort({ key: 'due', direction: 'desc' }, 'title')).toEqual({
      key: 'title',
      direction: 'asc',
    });
  });

  it('says what happened in words', () => {
    expect(describeSort({ key: 'due', direction: 'desc' })).toBe('Sorted by due date, descending.');
    expect(describeSort(null)).toBe('Back to board order.');
  });
});

import { describe, expect, it } from 'vitest';

import {
  EMPTY_FILTER,
  cardMatches,
  findCard,
  highestPriority,
  matchesFilter,
  moveCard,
  moveList,
  patchCard,
  removeCard,
} from './boardModel';
import type { BoardList, CardSummary, Label } from './boardsApi';

function card(id: string, listId: string, labelIds: string[] = []): CardSummary {
  return {
    id,
    list_id: listId,
    title: id,
    has_description: false,
    label_ids: labelIds,
    assignee_ids: [],
    due_date: null,
  };
}

function board(): BoardList[] {
  return [
    { id: 'todo', name: 'To do', cards: [card('a', 'todo'), card('b', 'todo'), card('c', 'todo')] },
    { id: 'done', name: 'Done', cards: [card('d', 'done')] },
  ];
}

const ids = (list: BoardList) => list.cards.map((entry) => entry.id);

describe('moveCard', () => {
  it('reorders inside the same list', () => {
    const result = moveCard(board(), 'c', 'todo', 0);
    expect(ids(result[0])).toEqual(['c', 'a', 'b']);
  });

  it('moves across lists and updates the list id', () => {
    const result = moveCard(board(), 'a', 'done', 1);
    expect(ids(result[0])).toEqual(['b', 'c']);
    expect(ids(result[1])).toEqual(['d', 'a']);
    expect(result[1].cards[1].list_id).toBe('done');
  });

  it('appends when the index is past the end', () => {
    const result = moveCard(board(), 'a', 'done', 99);
    expect(ids(result[1])).toEqual(['d', 'a']);
  });

  it('does not mutate its input', () => {
    const original = board();
    moveCard(original, 'a', 'done', 0);
    expect(ids(original[0])).toEqual(['a', 'b', 'c']);
  });

  it('ignores unknown cards and lists', () => {
    const original = board();
    expect(moveCard(original, 'missing', 'done', 0)).toBe(original);
    expect(moveCard(original, 'a', 'missing', 0)).toBe(original);
  });
});

describe('moveList', () => {
  it('places a list at the requested index', () => {
    const result = moveList(board(), 'done', 0);
    expect(result.map((list) => list.id)).toEqual(['done', 'todo']);
  });

  it('clamps the index to the end', () => {
    const result = moveList(board(), 'todo', 50);
    expect(result.map((list) => list.id)).toEqual(['done', 'todo']);
  });
});

describe('findCard, removeCard and patchCard', () => {
  it('locates a card', () => {
    expect(findCard(board(), 'd')).toEqual({ listIndex: 1, cardIndex: 0 });
    expect(findCard(board(), 'nope')).toBeNull();
  });

  it('removes only the requested card', () => {
    const result = removeCard(board(), 'b');
    expect(ids(result[0])).toEqual(['a', 'c']);
    expect(ids(result[1])).toEqual(['d']);
  });

  it('patches a single card', () => {
    const result = patchCard(board(), 'a', { title: 'Renamed', has_description: true });
    expect(result[0].cards[0]).toMatchObject({ title: 'Renamed', has_description: true });
    expect(result[0].cards[1].title).toBe('b');
  });
});

describe('priority helpers', () => {
  const labels: Label[] = [
    { id: 'l1', board_id: 'b', name: 'Low', color: 'blue', priority: 'low' },
    { id: 'l2', board_id: 'b', name: 'Urgent', color: 'red', priority: 'urgent' },
    { id: 'l3', board_id: 'b', name: 'Plain', color: 'slate', priority: 'none' },
  ];

  it('returns the highest priority among the labels of a card', () => {
    expect(highestPriority(card('x', 'todo', ['l1', 'l2']), labels)).toBe('urgent');
    expect(highestPriority(card('x', 'todo', ['l3']), labels)).toBe('none');
    expect(highestPriority(card('x', 'todo'), labels)).toBe('none');
  });

  it('matches every card when no label is selected', () => {
    expect(matchesFilter(card('x', 'todo'), [])).toBe(true);
  });

  it('matches cards that carry at least one selected label', () => {
    expect(matchesFilter(card('x', 'todo', ['l1']), ['l1', 'l2'])).toBe(true);
    expect(matchesFilter(card('x', 'todo', ['l3']), ['l1', 'l2'])).toBe(false);
  });
});

describe('cardMatches', () => {
  const ctx = { meId: 'u-me', today: '2026-10-22' };
  const base = card('a', 'todo', []);

  it('matches everything when nothing is selected', () => {
    expect(cardMatches(base, EMPTY_FILTER, ctx)).toBe(true);
  });

  it('keeps only my cards when asked', () => {
    const mine = { ...base, assignee_ids: ['u-me', 'u-wen'] };
    const filter = { ...EMPTY_FILTER, mine: true };

    expect(cardMatches(mine, filter, ctx)).toBe(true);
    expect(cardMatches(base, filter, ctx)).toBe(false);
    expect(cardMatches(mine, filter, { ...ctx, meId: undefined })).toBe(false);
  });

  it('keeps only overdue cards, and a card due today is not overdue yet', () => {
    const filter = { ...EMPTY_FILTER, overdue: true };

    expect(cardMatches({ ...base, due_date: '2026-10-21' }, filter, ctx)).toBe(true);
    expect(cardMatches({ ...base, due_date: '2026-10-22' }, filter, ctx)).toBe(false);
    expect(cardMatches(base, filter, ctx)).toBe(false);
  });

  it('combines the filters with AND, and labels with OR', () => {
    const filter = { labelIds: ['x', 'y'], mine: true, overdue: false };
    const both = { ...base, label_ids: ['y'], assignee_ids: ['u-me'] };

    expect(cardMatches(both, filter, ctx)).toBe(true);
    expect(cardMatches({ ...both, label_ids: ['z'] }, filter, ctx)).toBe(false);
    expect(cardMatches({ ...both, assignee_ids: [] }, filter, ctx)).toBe(false);
  });
});

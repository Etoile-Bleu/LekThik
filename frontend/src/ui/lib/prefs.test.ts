import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PREFERENCES,
  boardPrefsFor,
  isDefaultBoardPrefs,
  normalizeDialogLayout,
} from './prefs';

describe('board settings', () => {
  it('fills a board in with the defaults', () => {
    expect(boardPrefsFor(DEFAULT_PREFERENCES, 'b1')).toEqual({
      card_display: null,
      view: 'board',
      column_width: 'default',
      collapsed_lists: [],
    });
  });

  it('keeps what the person chose and fills in the rest', () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      boards: { b1: { view: 'calendar' } as never },
    };
    const own = boardPrefsFor(prefs, 'b1');
    expect(own.view).toBe('calendar');
    expect(own.collapsed_lists).toEqual([]);
  });

  it('knows when a board holds nothing but defaults', () => {
    expect(isDefaultBoardPrefs(boardPrefsFor(DEFAULT_PREFERENCES, 'b1'))).toBe(true);
    expect(isDefaultBoardPrefs({ ...boardPrefsFor(DEFAULT_PREFERENCES, 'b1'), view: 'list' })).toBe(
      false
    );
    expect(
      isDefaultBoardPrefs({ ...boardPrefsFor(DEFAULT_PREFERENCES, 'b1'), collapsed_lists: ['x'] })
    ).toBe(false);
  });
});

describe('the card dialog layout', () => {
  it('lists every property once, in the order given first', () => {
    expect(normalizeDialogLayout({ order: ['labels', 'due_date'], hidden: [] }).order).toEqual([
      'labels',
      'due_date',
      'assignees',
      'list',
    ]);
  });

  it('drops repeats and properties that do not exist', () => {
    const layout = normalizeDialogLayout({
      order: ['list', 'list', 'comments' as never],
      hidden: ['labels', 'labels', 'comments' as never],
    });
    expect(layout.order).toEqual(['list', 'assignees', 'due_date', 'labels']);
    expect(layout.hidden).toEqual(['labels']);
  });

  it('falls back to the default order with no layout', () => {
    expect(normalizeDialogLayout(undefined)).toEqual({
      order: ['assignees', 'due_date', 'labels', 'list'],
      hidden: [],
    });
  });
});

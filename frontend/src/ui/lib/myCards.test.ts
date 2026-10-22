import { describe, expect, it } from 'vitest';

import type { AssignedCard } from './boardsApi';
import { groupMyCards, groupOf } from './myCards';

const today = '2026-10-22';

function card(id: string, due: string | null): AssignedCard {
  return {
    id,
    title: id,
    due_date: due,
    list_id: 'l',
    list_name: 'Doing',
    board_id: 'b',
    board_name: 'Launch',
    workspace_id: 'w',
    workspace_name: 'Studio',
  };
}

describe('my cards', () => {
  it('sorts a card into the group its date calls for', () => {
    expect(groupOf(card('a', '2026-10-21'), today)).toBe('overdue');
    expect(groupOf(card('a', '2026-01-01'), today)).toBe('overdue');
    expect(groupOf(card('a', '2026-10-22'), today)).toBe('today');
    expect(groupOf(card('a', '2026-10-23'), today)).toBe('week');
    expect(groupOf(card('a', '2026-10-29'), today)).toBe('week');
    expect(groupOf(card('a', '2026-10-30'), today)).toBe('later');
    expect(groupOf(card('a', null), today)).toBe('none');
  });

  it('puts overdue first and leaves empty groups out', () => {
    const groups = groupMyCards(
      [card('later', '2027-01-01'), card('late', '2026-10-01'), card('none', null)],
      today
    );

    expect(groups.map((group) => group.key)).toEqual(['overdue', 'later', 'none']);
    expect(groups[0].cards.map((c) => c.id)).toEqual(['late']);
  });

  it('keeps the order the cards came in inside a group', () => {
    const groups = groupMyCards(
      [card('b', '2026-10-24'), card('a', '2026-10-25'), card('c', '2026-10-26')],
      today
    );

    expect(groups[0].cards.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('is empty with nothing assigned', () => {
    expect(groupMyCards([], today)).toEqual([]);
  });

  it('follows the day given, so a card turns overdue at midnight', () => {
    const due = card('a', '2026-10-22');
    expect(groupOf(due, '2026-10-22')).toBe('today');
    expect(groupOf(due, '2026-10-23')).toBe('overdue');
  });
});

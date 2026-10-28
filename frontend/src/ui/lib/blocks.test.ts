import { describe, expect, it } from 'vitest';

import {
  DEFAULT_AGENDA,
  DEFAULT_COUNTER,
  agendaConfig,
  agendaGroups,
  calendarConfig,
  cardsOf,
  counterConfig,
  dueByDay,
  guessDoneList,
  lateCardsOf,
  lateLabel,
  lateSeverity,
  noteConfig,
  progressConfig,
  readCounter,
  readProgress,
  sizeOf,
} from './blocks';
import type { BoardList, CardSummary } from './boardsApi';

const today = '2026-10-22';

function card(id: string, due: string | null, extra: Partial<CardSummary> = {}): CardSummary {
  return {
    id,
    list_id: 'doing',
    title: `Card ${id}`,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: due,
    ...extra,
  };
}

function list(id: string, name: string, cards: CardSummary[]): BoardList {
  return { id, name, wip_limit: null, kind: 'list', config: {}, cards };
}

const panels: BoardList[] = [
  list('doing', 'Doing', [
    card('late', '2026-10-20'),
    card('today', '2026-10-22', { assignee_ids: ['me'] }),
    card('soon', '2026-10-24'),
    card('far', '2026-11-30'),
    card('none', null),
  ]),
  list('done', 'Done', [card('done1', '2026-10-01'), card('done2', null)]),
  {
    id: 'note',
    name: 'Rules',
    wip_limit: null,
    kind: 'note',
    config: { size: 'normal', text: '' },
    cards: [],
  },
];

describe('panels', () => {
  it('only lists carry cards', () => {
    expect(cardsOf(panels).map((c) => c.id)).toEqual([
      'late',
      'today',
      'soon',
      'far',
      'none',
      'done1',
      'done2',
    ]);
  });

  it('reads settings with defaults, so a missing field never breaks drawing', () => {
    const empty: BoardList = { ...panels[2], kind: 'agenda', config: {} };

    expect(agendaConfig(empty)).toEqual(DEFAULT_AGENDA);
    expect(calendarConfig({ ...empty, kind: 'calendar' }).size).toBe('normal');
    expect(noteConfig({ ...empty, kind: 'note' }).text).toBe('');
    expect(counterConfig({ ...empty, kind: 'counter' })).toEqual(DEFAULT_COUNTER);
    expect(sizeOf({ ...empty, config: { size: 'wide' } })).toBe('wide');
    expect(sizeOf(empty)).toBe('normal');
  });
});

describe('the agenda', () => {
  const week = { ...DEFAULT_AGENDA, range: 'week' as const };

  it('puts late cards first and then each day that has something due', () => {
    const groups = agendaGroups(panels, week, today, 'me');

    expect(groups.map((group) => group.key)).toEqual(['late', '2026-10-22', '2026-10-24']);
    expect(groups[0].label).toBe('Overdue');
    expect(groups[0].cards.map((entry) => entry.card.id)).toEqual(['done1', 'late']);
    expect(groups[1].label).toBe('Today');
    expect(groups[1].cards[0].listName).toBe('Doing');
  });

  it('leaves out cards without a date and cards beyond the range', () => {
    const ids = agendaGroups(panels, week, today, 'me').flatMap((group) =>
      group.cards.map((entry) => entry.card.id)
    );

    expect(ids).not.toContain('none');
    expect(ids).not.toContain('far');
  });

  it('looks only at today when asked, but still shows what is late', () => {
    const groups = agendaGroups(panels, { ...week, range: 'today' }, today, 'me');

    expect(groups.map((group) => group.key)).toEqual(['late', '2026-10-22']);
  });

  it('can show only my cards', () => {
    const groups = agendaGroups(panels, { ...week, mine_only: true }, today, 'me');

    expect(groups.flatMap((group) => group.cards.map((entry) => entry.card.id))).toEqual(['today']);
    expect(agendaGroups(panels, { ...week, mine_only: true }, today, undefined)).toEqual([]);
  });

  it('is empty when nothing is due', () => {
    expect(agendaGroups([list('a', 'A', [card('x', null)])], week, today, 'me')).toEqual([]);
  });

  it('ignores blocks', () => {
    expect(agendaGroups([panels[2]], week, today, 'me')).toEqual([]);
  });

  it('orders the days from the nearest', () => {
    const groups = agendaGroups(
      [list('a', 'A', [card('c', '2026-10-26'), card('a', '2026-10-23'), card('b', '2026-10-25')])],
      week,
      today,
      'me'
    );

    expect(groups.map((group) => group.day)).toEqual(['2026-10-23', '2026-10-25', '2026-10-26']);
  });
});

describe('counters', () => {
  const base = { ...DEFAULT_COUNTER };

  it('counts the cards that are overdue', () => {
    const reading = readCounter({ ...base, metric: 'overdue' }, panels, today);

    expect(reading.value).toBe('2');
    expect(reading.tone).toBe('late');
    expect(reading.spoken).toContain('Overdue cards: 2');
  });

  it('says so, calmly, when nothing is late', () => {
    const reading = readCounter({ ...base, metric: 'overdue' }, [list('a', 'A', [])], today);

    expect(reading.value).toBe('0');
    expect(reading.tone).toBe('good');
    expect(reading.detail).toBe('Nothing is late.');
  });

  it('works out the share of cards in the done list', () => {
    const reading = readCounter(
      { ...base, metric: 'done_percent', done_list_id: 'done' },
      panels,
      today
    );

    expect(reading.value).toBe('29%');
    expect(reading.percent).toBe(29);
    expect(reading.detail).toBe('2 of 7 cards in Done');
  });

  it('is complete, and good, when every card is done', () => {
    const reading = readCounter(
      { ...base, metric: 'done_percent', done_list_id: 'done' },
      [list('done', 'Done', [card('a', null), card('b', null)])],
      today
    );

    expect(reading.percent).toBe(100);
    expect(reading.tone).toBe('good');
  });

  it('shows zero, not a division error, with no cards', () => {
    const reading = readCounter(
      { ...base, metric: 'done_percent', done_list_id: 'done' },
      [list('done', 'Done', [])],
      today
    );

    expect(reading.value).toBe('0%');
  });

  it('asks for a done list when there is none, or it is gone', () => {
    for (const done of [null, 'deleted', 'note']) {
      const reading = readCounter(
        { ...base, metric: 'done_percent', done_list_id: done },
        panels,
        today
      );
      expect(reading.value).toBe('–');
      expect(reading.detail).toContain('Choose the list that means done');
    }
  });

  it('counts the days left, and warns when it is close', () => {
    const far = readCounter({ ...base, metric: 'days_left', date: '2026-11-05' }, panels, today);
    expect(far.value).toBe('14');
    expect(far.caption).toBe('Days left');
    expect(far.tone).toBe('calm');

    const close = readCounter({ ...base, metric: 'days_left', date: '2026-10-24' }, panels, today);
    expect(close.value).toBe('2');
    expect(close.tone).toBe('warn');

    const one = readCounter({ ...base, metric: 'days_left', date: '2026-10-23' }, panels, today);
    expect(one.caption).toBe('Day left');
  });

  it('says today on the day, and counts the days since afterwards', () => {
    const on = readCounter({ ...base, metric: 'days_left', date: today }, panels, today);
    expect(on.value).toBe('Today');

    const after = readCounter({ ...base, metric: 'days_left', date: '2026-10-19' }, panels, today);
    expect(after.value).toBe('3');
    expect(after.caption).toBe('Days since');
    expect(after.tone).toBe('late');
  });

  it('uses the label the person wrote', () => {
    const reading = readCounter(
      { ...base, metric: 'days_left', date: '2026-11-05', label: 'Days to launch' },
      panels,
      today
    );

    expect(reading.caption).toBe('Days to launch');
    expect(reading.spoken).toContain('Days to launch: 14 days left');
  });

  it('asks for a date when there is none', () => {
    const reading = readCounter({ ...base, metric: 'days_left', date: null }, panels, today);

    expect(reading.value).toBe('–');
  });

  it('counts all the cards', () => {
    const reading = readCounter({ ...base, metric: 'total_cards' }, panels, today);

    expect(reading.value).toBe('7');
    expect(reading.detail).toBe('On 2 lists.');
  });
});

describe('the calendar block', () => {
  it('groups the cards by their due day', () => {
    const byDay = dueByDay(panels);

    expect(byDay.get('2026-10-22')?.map((c) => c.id)).toEqual(['today']);
    expect(byDay.has('2026-10-23')).toBe(false);
    expect([...byDay.values()].flat()).toHaveLength(5);
  });
});

describe('guessDoneList', () => {
  it('prefers a list named like done, in English or French', () => {
    const named = [list('a', 'To do', []), list('b', 'Done', []), list('c', 'Backlog', [])];
    const french = [list('a', 'A faire', []), list('b', 'Terminé', []), list('c', 'Idées', [])];

    expect(guessDoneList(named)?.id).toBe('b');
    expect(guessDoneList(french)?.id).toBe('b');
  });

  it('falls back to the last list, and ignores blocks and empty boards', () => {
    const plain = [list('a', 'Ideas', []), list('b', 'Doing', []), list('c', 'Review', [])];
    const withBlock: BoardList[] = [
      list('a', 'Ideas', []),
      { id: 'n', name: 'Done', wip_limit: null, kind: 'note', config: {}, cards: [] },
    ];

    expect(guessDoneList(plain)?.id).toBe('c');
    expect(guessDoneList(withBlock)?.id).toBe('a');
    expect(guessDoneList([])).toBeNull();
  });
});

describe('readProgress', () => {
  const config = { ...progressConfig({ ...list('p', 'P', []), config: {} }) };

  it('starts as a ring with nothing chosen', () => {
    expect(config).toEqual({ size: 'normal', style: 'ring', label: '', done_list_id: null });
  });

  it('asks for a done list instead of showing a false zero', () => {
    const reading = readProgress(config, panels);

    expect(reading.state).toBe('setup');
    expect(reading.percent).toBe(0);
    expect(reading.spoken).toMatch(/no done list chosen/);
  });

  it('is the share of the cards that sit in the done list', () => {
    const board = [
      list('todo', 'To do', [card('a', null), card('b', null), card('c', null)]),
      list('done', 'Done', [card('d', null)]),
    ];

    const reading = readProgress({ ...config, done_list_id: 'done', label: 'Sprint 12' }, board);

    expect(reading).toMatchObject({ percent: 25, done: 1, total: 4, state: 'running' });
    expect(reading.caption).toBe('Sprint 12');
    expect(reading.detail).toBe('1 of 4 cards in Done');
    expect(reading.spoken).toBe('Sprint 12: 25 percent. 1 of 4 cards in Done.');
  });

  it('is complete when every card is done, and says so for an empty board', () => {
    const finished = [list('todo', 'To do', []), list('done', 'Done', [card('a', null)])];
    const empty = [list('todo', 'To do', []), list('done', 'Done', [])];

    expect(readProgress({ ...config, done_list_id: 'done' }, finished).state).toBe('complete');
    const none = readProgress({ ...config, done_list_id: 'done' }, empty);
    expect(none.state).toBe('empty');
    expect(none.percent).toBe(0);
  });

  it('treats a done list that is gone or is not a list as not set up', () => {
    const calendar: BoardList = {
      id: 'cal',
      name: 'Plan',
      wip_limit: null,
      kind: 'calendar',
      config: {},
      cards: [],
    };

    expect(readProgress({ ...config, done_list_id: 'ghost' }, panels).state).toBe('setup');
    expect(readProgress({ ...config, done_list_id: 'cal' }, [calendar]).state).toBe('setup');
  });
});

describe('lateCardsOf', () => {
  const board = [
    list('doing', 'Doing', [
      card('a', '2026-10-21', { assignee_ids: ['me'] }),
      card('b', '2026-10-10', { assignee_ids: ['me', 'you'] }),
      card('c', '2026-10-15', { assignee_ids: ['you'] }),
      card('d', '2026-10-22', { assignee_ids: ['me'] }),
      card('e', '2026-10-30', { assignee_ids: ['me'] }),
      card('f', null, { assignee_ids: ['me'] }),
      card('g', '2026-10-01', { assignee_ids: [] }),
    ]),
  ];

  it('keeps only my cards that are past their day, the most late first', () => {
    const late = lateCardsOf(board, 'me', today);

    expect(late.map((entry) => entry.card.id)).toEqual(['b', 'a']);
    expect(late.map((entry) => entry.daysLate)).toEqual([12, 1]);
    expect(late[0].listName).toBe('Doing');
  });

  it('is empty for a person who is nobody, and for someone with no late card', () => {
    expect(lateCardsOf(board, undefined, today)).toEqual([]);
    expect(lateCardsOf(board, 'stranger', today)).toEqual([]);
  });

  it('shows each person their own cards from the same board', () => {
    expect(lateCardsOf(board, 'you', today).map((entry) => entry.card.id)).toEqual(['b', 'c']);
  });

  it('skips blocks and steps the severity by days', () => {
    const calendar: BoardList = {
      id: 'cal',
      name: 'Plan',
      wip_limit: null,
      kind: 'calendar',
      config: {},
      cards: [card('x', '2026-10-01', { assignee_ids: ['me'] })],
    };

    expect(lateCardsOf([calendar], 'me', today)).toEqual([]);
    expect([1, 2, 3, 6, 7, 30].map(lateSeverity)).toEqual([
      'recent',
      'recent',
      'week',
      'week',
      'long',
      'long',
    ]);
    expect(lateLabel(1)).toBe('1 day late');
    expect(lateLabel(3)).toBe('3 days late');
  });
});

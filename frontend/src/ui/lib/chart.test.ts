import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';

import type { BoardList, BoardMember, CardSummary, ChartConfig, Label } from './boardsApi';
import { BARS_LIMIT, CHART_COLOR_COUNT, DONUT_LIMIT, readChart } from './chart';
import { contrastRatio } from './contrast';

const today = '2026-10-22';

function stylesheet(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), 'utf8');
}

const indexCss = stylesheet('../../index.css');
const themesCss = stylesheet('../styles/themes.css');

function card(id: string, extra: Partial<CardSummary> = {}): CardSummary {
  return {
    id,
    list_id: 'todo',
    title: `Card ${id}`,
    has_description: false,
    description_preview: '',
    label_ids: [],
    assignee_ids: [],
    due_date: null,
    ...extra,
  };
}

function list(id: string, name: string, cards: CardSummary[]): BoardList {
  return { id, name, wip_limit: null, kind: 'list', config: {}, cards };
}

function label(id: string, name: string): Label {
  return { id, board_id: 'b', name, color: 'blue', priority: 'none' };
}

const members = new Map<string, BoardMember>([
  ['maya', { user_id: 'maya', username: 'maya' }],
  ['wen', { user_id: 'wen', username: 'wen' }],
]);

const labels = [label('bug', 'Bug'), label('ui', 'UI')];

const panels = [
  list('todo', 'To do', [
    card('a', { label_ids: ['bug'], assignee_ids: ['maya'], due_date: '2026-10-20' }),
    card('b', { label_ids: ['bug', 'ui'], assignee_ids: ['maya', 'wen'], due_date: '2026-10-22' }),
    card('c', { due_date: '2026-10-25' }),
  ]),
  list('done', 'Done', [card('d', { label_ids: ['ui'], assignee_ids: ['wen'] })]),
  {
    id: 'note',
    name: 'Rules',
    wip_limit: null,
    kind: 'note',
    config: {},
    cards: [],
  } as BoardList,
];

function chart(source: ChartConfig['source'], style: ChartConfig['style'] = 'bars') {
  return readChart({ size: 'normal', source, style }, panels, labels, members, today);
}

describe('readChart', () => {
  it('counts cards per list in board order and ignores blocks', () => {
    const reading = chart('list');

    expect(reading.rows.map((row) => [row.name, row.count])).toEqual([
      ['To do', 3],
      ['Done', 1],
    ]);
    expect(reading.title).toBe('Cards by list');
    expect(reading.cards).toBe(4);
    expect(reading.max).toBe(3);
  });

  it('counts a card in every label it has, biggest first, with those without one apart', () => {
    const reading = chart('label');

    expect(reading.rows.map((row) => [row.name, row.count])).toEqual([
      ['Bug', 2],
      ['UI', 2],
      ['No label', 1],
    ]);
    expect(reading.cards).toBe(4);
  });

  it('counts per person and keeps the unassigned', () => {
    const reading = chart('assignee');

    expect(reading.rows.map((row) => [row.name, row.count])).toEqual([
      ['maya', 2],
      ['wen', 2],
      ['Unassigned', 1],
    ]);
  });

  it('buckets the due dates in a fixed order and leaves empty ones in place', () => {
    const reading = chart('due');

    expect(reading.rows.map((row) => [row.name, row.count])).toEqual([
      ['Overdue', 1],
      ['Today', 1],
      ['Next 7 days', 1],
      ['Later', 0],
      ['No date', 1],
    ]);
  });

  it('keeps the colour of a person or a label whatever its rank', () => {
    const first = chart('assignee').rows.find((row) => row.name === 'wen');
    const swapped = readChart(
      { size: 'normal', source: 'assignee', style: 'bars' },
      [
        list('x', 'X', [
          card('z', { assignee_ids: ['wen'] }),
          card('y', { assignee_ids: ['wen'] }),
        ]),
      ],
      labels,
      members,
      today
    ).rows.find((row) => row.name === 'wen');

    expect(first?.color).toBe('var(--chart-2)');
    expect(swapped?.color).toBe(first?.color);
  });

  it('folds the smallest into Other past the limit of the shape', () => {
    const many = Array.from({ length: 10 }, (_, index) => label(`l${index}`, `Label ${index}`));
    const cards = many.map((entry, index) =>
      card(`c${index}`, { label_ids: [entry.id, ...many.slice(0, index).map((l) => l.id)] })
    );
    const board = [list('todo', 'To do', cards)];

    const bars = readChart(
      { size: 'normal', source: 'label', style: 'bars' },
      board,
      many,
      members,
      today
    );
    const donut = readChart(
      { size: 'normal', source: 'label', style: 'donut' },
      board,
      many,
      members,
      today
    );

    expect(bars.rows).toHaveLength(BARS_LIMIT);
    expect(bars.rows.at(-1)?.name).toBe('Other');
    expect(donut.rows).toHaveLength(DONUT_LIMIT);
    expect(donut.rows.at(-1)?.name).toBe('Other');
  });

  it('says there is nothing to chart on a board with no cards', () => {
    const reading = readChart(
      { size: 'normal', source: 'list', style: 'bars' },
      [list('todo', 'To do', [])],
      labels,
      members,
      today
    );

    expect(reading.empty).toBe(true);
    expect(reading.spoken).toMatch(/no cards yet/);
  });

  it('reads the whole chart as one sentence', () => {
    expect(chart('list').spoken).toBe('Cards by list, 4 cards: To do 3, Done 1.');
  });
});

function tokens(css: string, block: RegExp): string[] {
  const body = css.match(block)?.[1] ?? '';
  return Array.from({ length: CHART_COLOR_COUNT }, (_, index) => {
    const found = body.match(new RegExp(`--chart-${index + 1}:\\s*(#[0-9a-fA-F]{6})`));
    return found?.[1] ?? '';
  });
}

function surfaces(css: string, block: RegExp): string[] {
  const body = css.match(block)?.[1] ?? '';
  return ['--color-paper-card', '--color-surface'].map(
    (name) => body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? ''
  );
}

describe('chart colours', () => {
  const themes: Array<[string, string, RegExp]> = [
    ['light', indexCss, /:root\s*{([^}]*)}/],
    ['dark', themesCss, /html\[data-theme='dark'\] \.shell\s*{([^}]*)}/],
    ['high contrast', themesCss, /html\[data-theme='contrast'\] \.shell\s*{([^}]*)}/],
  ];

  it.each(themes)('keep 3 to 1 against the surfaces in the %s theme', (_name, css, block) => {
    const colours = tokens(css, block);
    const grounds = surfaces(css, block);

    expect(colours.every(Boolean)).toBe(true);
    expect(grounds.every(Boolean)).toBe(true);
    for (const colour of colours) {
      for (const ground of grounds) {
        expect(contrastRatio(colour, ground)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

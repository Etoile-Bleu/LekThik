import { cardsOf, isCardList } from './blocks';
import type { BoardList, BoardMember, ChartConfig, Label } from './boardsApi';
import { daysUntil } from './dueDate';

export const CHART_COLOR_COUNT = 7;
export const BARS_LIMIT = 7;
export const DONUT_LIMIT = 5;

export interface ChartRow {
  key: string;
  name: string;
  count: number;
  color: string;
}

export interface ChartReading {
  title: string;
  rows: ChartRow[];
  cards: number;
  max: number;
  sum: number;
  empty: boolean;
  spoken: string;
}

const OTHER_COLOR = 'var(--color-text-muted)';

function colorFor(stableIndex: number): string {
  return `var(--chart-${(stableIndex % CHART_COLOR_COUNT) + 1})`;
}

function plural(count: number, one: string): string {
  return `${count} ${count === 1 ? one : `${one}s`}`;
}

function byList(panels: BoardList[]): ChartRow[] {
  return panels.filter(isCardList).map((panel, index) => ({
    key: panel.id,
    name: panel.name,
    count: panel.cards.length,
    color: colorFor(index),
  }));
}

function byLabel(panels: BoardList[], labels: Label[]): ChartRow[] {
  const cards = cardsOf(panels);
  const rows = labels.map((label, index) => ({
    key: label.id,
    name: label.name,
    count: cards.filter((card) => card.label_ids.includes(label.id)).length,
    color: colorFor(index),
  }));
  const unlabelled = cards.filter((card) => card.label_ids.length === 0).length;
  return [...rows, { key: 'none', name: 'No label', count: unlabelled, color: OTHER_COLOR }];
}

function byAssignee(panels: BoardList[], members: Map<string, BoardMember>): ChartRow[] {
  const cards = cardsOf(panels);
  const rows = [...members.values()].map((member, index) => ({
    key: member.user_id,
    name: member.username,
    count: cards.filter((card) => card.assignee_ids.includes(member.user_id)).length,
    color: colorFor(index),
  }));
  const unassigned = cards.filter((card) => card.assignee_ids.length === 0).length;
  return [...rows, { key: 'none', name: 'Unassigned', count: unassigned, color: OTHER_COLOR }];
}

function byDue(panels: BoardList[], today: string): ChartRow[] {
  const buckets = [
    { key: 'late', name: 'Overdue', count: 0 },
    { key: 'today', name: 'Today', count: 0 },
    { key: 'week', name: 'Next 7 days', count: 0 },
    { key: 'later', name: 'Later', count: 0 },
    { key: 'none', name: 'No date', count: 0 },
  ];
  for (const card of cardsOf(panels)) {
    const distance = card.due_date ? daysUntil(card.due_date, today) : null;
    const index =
      distance === null ? 4 : distance < 0 ? 0 : distance === 0 ? 1 : distance <= 7 ? 2 : 3;
    buckets[index].count += 1;
  }
  return buckets.map((bucket, index) => ({
    ...bucket,
    color: index === 4 ? OTHER_COLOR : colorFor(index),
  }));
}

const TITLES: Record<ChartConfig['source'], string> = {
  list: 'Cards by list',
  label: 'Cards by label',
  assignee: 'Cards by person',
  due: 'Cards by due date',
};

function biggestFirst(rows: ChartRow[]): ChartRow[] {
  return [...rows].sort((a, b) => b.count - a.count);
}

function foldTail(rows: ChartRow[], limit: number): ChartRow[] {
  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit - 1);
  const rest = rows.slice(limit - 1);
  return [
    ...head,
    {
      key: 'other',
      name: 'Other',
      count: rest.reduce((sum, row) => sum + row.count, 0),
      color: OTHER_COLOR,
    },
  ];
}

export function readChart(
  config: ChartConfig,
  panels: BoardList[],
  labels: Label[],
  members: Map<string, BoardMember>,
  today: string
): ChartReading {
  const cards = cardsOf(panels).length;
  const limit = config.style === 'donut' ? DONUT_LIMIT : BARS_LIMIT;

  let rows: ChartRow[];
  switch (config.source) {
    case 'list':
      rows = byList(panels);
      break;
    case 'label':
      rows = biggestFirst(byLabel(panels, labels));
      break;
    case 'assignee':
      rows = biggestFirst(byAssignee(panels, members));
      break;
    case 'due':
      rows = byDue(panels, today);
      break;
  }

  const shown = foldTail(
    config.source === 'label' || config.source === 'assignee'
      ? rows.filter((row) => row.count > 0)
      : rows,
    limit
  );
  const sum = shown.reduce((total, row) => total + row.count, 0);
  const max = shown.reduce((highest, row) => Math.max(highest, row.count), 0);
  const title = TITLES[config.source];
  const empty = cards === 0;
  const spoken = empty
    ? `${title}: there are no cards yet.`
    : `${title}, ${plural(cards, 'card')}: ${shown.map((row) => `${row.name} ${row.count}`).join(', ')}.`;

  return { title, rows: shown, cards, max, sum, empty, spoken };
}

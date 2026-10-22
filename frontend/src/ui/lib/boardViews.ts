import type { BoardList, CardSummary, Label, Priority } from './boardsApi';
import { priorityRank } from './boardModel';

export type SortKey = 'title' | 'list' | 'labels' | 'assignees' | 'due';
export type SortDirection = 'asc' | 'desc';

export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/** A card with everything the table needs to show and sort it. */
export interface TableRow {
  card: CardSummary;
  listId: string;
  listName: string;
  /** Position in the board, lists left to right then cards top to bottom. */
  order: number;
  labels: Label[];
  assigneeNames: string[];
}

export function buildRows(
  lists: BoardList[],
  labels: Label[],
  members: Array<{ user_id: string; username: string }>
): TableRow[] {
  const labelsById = new Map(labels.map((label) => [label.id, label]));
  const namesById = new Map(members.map((member) => [member.user_id, member.username]));
  let order = 0;

  return lists.flatMap((list) =>
    list.cards.map((card) => ({
      card,
      listId: list.id,
      listName: list.name,
      order: order++,
      labels: card.label_ids
        .map((id) => labelsById.get(id))
        .filter((label): label is Label => label !== undefined),
      assigneeNames: card.assignee_ids.map((id) => namesById.get(id) ?? 'Former member'),
    }))
  );
}

function topPriority(row: TableRow): Priority {
  return row.labels.reduce<Priority>(
    (top, label) => (priorityRank(label.priority) > priorityRank(top) ? label.priority : top),
    'none'
  );
}

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compare(a: TableRow, b: TableRow, key: SortKey): number {
  switch (key) {
    case 'title':
      return collator.compare(a.card.title, b.card.title);
    case 'list':
      return a.order - b.order;
    case 'labels':
      // Most urgent first when ascending reads naturally as "highest priority on top".
      return priorityRank(topPriority(b)) - priorityRank(topPriority(a));
    case 'assignees':
      return collator.compare(a.assigneeNames[0] ?? '', b.assigneeNames[0] ?? '');
    case 'due':
      return (a.card.due_date ?? '').localeCompare(b.card.due_date ?? '');
  }
}

/**
 * Sorts a copy of the rows. With no sort the board order is kept. Cards with
 * nothing to sort on (no due date, no assignee) always go last, whichever way
 * the column is sorted, so they never crowd out the ones that matter.
 */
export function sortRows(rows: TableRow[], sort: Sort | null): TableRow[] {
  if (!sort) {
    return [...rows];
  }
  const sign = sort.direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    if (sort.key === 'due' && (a.card.due_date === null || b.card.due_date === null)) {
      if (a.card.due_date === b.card.due_date) return a.order - b.order;
      return a.card.due_date === null ? 1 : -1;
    }
    if (
      sort.key === 'assignees' &&
      (a.assigneeNames.length === 0 || b.assigneeNames.length === 0)
    ) {
      if (a.assigneeNames.length === b.assigneeNames.length) return a.order - b.order;
      return a.assigneeNames.length === 0 ? 1 : -1;
    }
    return compare(a, b, sort.key) * sign || a.order - b.order;
  });
}

/** Click once to sort ascending, again for descending, a third time to go back to the board order. */
export function nextSort(current: Sort | null, key: SortKey): Sort | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

export const SORT_LABELS: Record<SortKey, string> = {
  title: 'Card',
  list: 'List',
  labels: 'Labels',
  assignees: 'Assignees',
  due: 'Due date',
};

/** What a screen reader hears after sorting. */
export function describeSort(sort: Sort | null): string {
  if (!sort) return 'Back to board order.';
  const word = sort.direction === 'asc' ? 'ascending' : 'descending';
  return `Sorted by ${SORT_LABELS[sort.key].toLowerCase()}, ${word}.`;
}

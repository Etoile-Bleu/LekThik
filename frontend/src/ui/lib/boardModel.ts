import type { BoardList, CardSummary, Label, Priority } from './boardsApi';

const PRIORITY_RANK: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  none: 'No priority',
  low: 'Low priority',
  medium: 'Medium priority',
  high: 'High priority',
  urgent: 'Urgent',
};

export function priorityRank(priority: Priority): number {
  return PRIORITY_RANK[priority];
}

export function highestPriority(card: CardSummary, labels: Label[]): Priority {
  return labels
    .filter((label) => card.label_ids.includes(label.id))
    .reduce<Priority>(
      (highest, label) =>
        priorityRank(label.priority) > priorityRank(highest) ? label.priority : highest,
      'none'
    );
}

export function matchesFilter(card: CardSummary, selectedLabelIds: string[]): boolean {
  if (selectedLabelIds.length === 0) {
    return true;
  }
  return card.label_ids.some((id) => selectedLabelIds.includes(id));
}

export interface CardFilter {
  labelIds: string[];
  mine: boolean;
  overdue: boolean;
}

export const EMPTY_FILTER: CardFilter = { labelIds: [], mine: false, overdue: false };

export function isFiltering(filter: CardFilter): boolean {
  return filter.labelIds.length > 0 || filter.mine || filter.overdue;
}

/** Labels combine with OR, the other two narrow the result further. */
export function cardMatches(
  card: CardSummary,
  filter: CardFilter,
  context: { meId: string | undefined; today: string }
): boolean {
  if (!matchesFilter(card, filter.labelIds)) {
    return false;
  }
  if (filter.mine && !(context.meId && card.assignee_ids.includes(context.meId))) {
    return false;
  }
  if (filter.overdue && !(card.due_date && card.due_date < context.today)) {
    return false;
  }
  return true;
}

export function findCard(
  lists: BoardList[],
  cardId: string
): { listIndex: number; cardIndex: number } | null {
  for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
    const cardIndex = lists[listIndex].cards.findIndex((card) => card.id === cardId);
    if (cardIndex !== -1) {
      return { listIndex, cardIndex };
    }
  }
  return null;
}

export function moveList(lists: BoardList[], listId: string, toIndex: number): BoardList[] {
  const from = lists.findIndex((list) => list.id === listId);
  if (from === -1) {
    return lists;
  }

  const remaining = lists.filter((list) => list.id !== listId);
  const target = Math.max(0, Math.min(toIndex, remaining.length));
  return [...remaining.slice(0, target), lists[from], ...remaining.slice(target)];
}

export function moveCard(
  lists: BoardList[],
  cardId: string,
  toListId: string,
  toIndex: number
): BoardList[] {
  const source = findCard(lists, cardId);
  const targetExists = lists.some((list) => list.id === toListId);
  if (!source || !targetExists) {
    return lists;
  }

  const card = lists[source.listIndex].cards[source.cardIndex];
  const moved: CardSummary = { ...card, list_id: toListId };

  return lists.map((list) => {
    const without = list.cards.filter((candidate) => candidate.id !== cardId);
    if (list.id !== toListId) {
      return without.length === list.cards.length ? list : { ...list, cards: without };
    }
    const target = Math.max(0, Math.min(toIndex, without.length));
    return { ...list, cards: [...without.slice(0, target), moved, ...without.slice(target)] };
  });
}

export function removeCard(lists: BoardList[], cardId: string): BoardList[] {
  return lists.map((list) =>
    list.cards.some((card) => card.id === cardId)
      ? { ...list, cards: list.cards.filter((card) => card.id !== cardId) }
      : list
  );
}

export function patchCard(
  lists: BoardList[],
  cardId: string,
  changes: Partial<CardSummary>
): BoardList[] {
  return lists.map((list) =>
    list.cards.some((card) => card.id === cardId)
      ? {
          ...list,
          cards: list.cards.map((card) => (card.id === cardId ? { ...card, ...changes } : card)),
        }
      : list
  );
}

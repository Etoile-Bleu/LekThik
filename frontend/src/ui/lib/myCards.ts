import type { AssignedCard } from './boardsApi';
import { daysUntil } from './dueDate';

export type MyCardsGroup = 'overdue' | 'today' | 'week' | 'later' | 'none';

export const MY_CARDS_GROUPS: Array<{ key: MyCardsGroup; label: string }> = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Next 7 days' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No date' },
];

const WEEK_DAYS = 7;

export function groupOf(card: AssignedCard, today: string): MyCardsGroup {
  if (card.due_date === null) return 'none';
  const distance = daysUntil(card.due_date, today);
  if (distance < 0) return 'overdue';
  if (distance === 0) return 'today';
  if (distance <= WEEK_DAYS) return 'week';
  return 'later';
}

/**
 * Splits the cards by how urgent they are. Overdue comes first on purpose: a
 * list that hides what slipped behind "later" is how deadlines get missed.
 * Empty groups are left out, and each keeps the order it was given.
 */
export function groupMyCards(
  cards: AssignedCard[],
  today: string
): Array<{ key: MyCardsGroup; label: string; cards: AssignedCard[] }> {
  const groups = new Map<MyCardsGroup, AssignedCard[]>();
  for (const card of cards) {
    const key = groupOf(card, today);
    groups.set(key, [...(groups.get(key) ?? []), card]);
  }

  return MY_CARDS_GROUPS.flatMap(({ key, label }) => {
    const inGroup = groups.get(key);
    return inGroup ? [{ key, label, cards: inGroup }] : [];
  });
}

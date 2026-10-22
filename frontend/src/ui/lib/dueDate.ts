/**
 * Due dates are calendar days (`YYYY-MM-DD`) with no time zone, so "today" is
 * the viewer's local day and comparisons never go through `Date` parsing,
 * which would shift the day for people west of UTC.
 */

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

const DAY_MS = 86_400_000;
const SOON_DAYS = 3;

export function toDayString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / DAY_MS);
}

export function daysUntil(day: string, today: string): number {
  return dayNumber(day) - dayNumber(today);
}

export function addDays(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return toDayString(new Date(year, month - 1, date + amount));
}

export function dueState(day: string, today: string): DueState {
  const distance = daysUntil(day, today);
  if (distance < 0) return 'overdue';
  if (distance === 0) return 'today';
  if (distance <= SOON_DAYS) return 'soon';
  return 'later';
}

function parts(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/** Short text for a card: "Today", "Tomorrow", a weekday this week, else "Oct 31". */
export function shortDue(day: string, today: string): string {
  const distance = daysUntil(day, today);
  if (distance === 0) return 'Today';
  if (distance === 1) return 'Tomorrow';
  if (distance === -1) return 'Yesterday';
  const date = parts(day);
  if (distance > 1 && distance < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  }
  const sameYear = date.getFullYear() === parts(today).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function longDue(day: string): string {
  return parts(day).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATE_WORDS: Record<DueState, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  soon: 'Due soon',
  later: 'Due',
};

/** The sentence a screen reader gets, so state never depends on colour. */
export function describeDue(day: string, today: string): string {
  return `${STATE_WORDS[dueState(day, today)]}, ${longDue(day)}`;
}

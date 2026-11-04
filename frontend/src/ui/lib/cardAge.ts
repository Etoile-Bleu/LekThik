/**
 * How long a card has sat still: time elapsed since an ISO timestamp
 * (`list_entered_at`, `blocked_since`), not a calendar day like `dueDate.ts`.
 * Badge text stays compact ("3d", "2w"), the universal "time ago" register,
 * on purpose: unlike a due date (a deadline someone set), elapsed time is
 * read at a glance, many times a day, across a whole board.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30.44 * DAY_MS;
const YEAR_MS = 365.25 * DAY_MS;

/** Below this, a card's age says nothing: every card is "new" for a while. */
export const AGE_NOTICE_MS = 2 * DAY_MS;
/** At or past this, a card has been sitting long enough to flag. */
export const AGE_STALE_MS = 5 * DAY_MS;

/** Mirrors the backend's `MAX_BLOCKED_REASON_CHARS`. */
export const BLOCKED_REASON_MAX_CHARS = 200;

export type AgeState = 'normal' | 'stale';

function elapsedMs(since: string, now: number): number {
  return Math.max(0, now - new Date(since).getTime());
}

/** Whether a card's time in its current list is worth a word about at all. */
export function isNoteworthyAge(since: string, now: number): boolean {
  return elapsedMs(since, now) >= AGE_NOTICE_MS;
}

export function ageState(since: string, now: number): AgeState {
  return elapsedMs(since, now) >= AGE_STALE_MS ? 'stale' : 'normal';
}

/** Compact badge text: "45m", "2h", "3d", "2w", "4mo", "1y". */
export function shortElapsed(since: string, now: number): string {
  const ms = elapsedMs(since, now);
  if (ms < MINUTE_MS) return 'now';
  if (ms < HOUR_MS) return `${Math.round(ms / MINUTE_MS)}m`;
  if (ms < DAY_MS) return `${Math.round(ms / HOUR_MS)}h`;
  if (ms < WEEK_MS) return `${Math.round(ms / DAY_MS)}d`;
  if (ms < MONTH_MS) return `${Math.round(ms / WEEK_MS)}w`;
  if (ms < YEAR_MS) return `${Math.round(ms / MONTH_MS)}mo`;
  return `${Math.round(ms / YEAR_MS)}y`;
}

function pluralize(amount: number, unit: string): string {
  const rounded = Math.max(1, Math.round(amount));
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'}`;
}

/** The full phrase for a sentence or a tooltip: "3 days", "2 weeks", "an hour". */
export function longElapsed(since: string, now: number): string {
  const ms = elapsedMs(since, now);
  if (ms < MINUTE_MS) return 'a moment';
  if (ms < HOUR_MS) return pluralize(ms / MINUTE_MS, 'minute');
  if (ms < DAY_MS) return pluralize(ms / HOUR_MS, 'hour');
  if (ms < WEEK_MS) return pluralize(ms / DAY_MS, 'day');
  if (ms < MONTH_MS) return pluralize(ms / WEEK_MS, 'week');
  if (ms < YEAR_MS) return pluralize(ms / MONTH_MS, 'month');
  return pluralize(ms / YEAR_MS, 'year');
}

/** When it happened, as a calendar date: "Oct 31" or "Oct 31, 2025" across years. */
export function enteredOn(since: string, now: number): string {
  const date = new Date(since);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** The sentence a screen reader gets for the age badge. */
export function describeAge(since: string, now: number): string {
  return `In this list for ${longElapsed(since, now)}, since ${enteredOn(since, now)}`;
}

/** The sentence a screen reader gets for the blocked badge. */
export function describeBlocked(since: string, now: number, reason: string | null): string {
  const base = `Blocked for ${longElapsed(since, now)}`;
  return reason ? `${base}: ${reason}` : base;
}

import { addDays, toDayString } from './dueDate';

/**
 * Calendar maths on `YYYY-MM-DD` strings. Dates never go through `Date`
 * parsing of a string, which would read them as UTC and shift the day for
 * people west of Greenwich.
 */

export interface CalendarDay {
  day: string;
  inMonth: boolean;
}

function parts(day: string): { year: number; month: number; date: number } {
  const [year, month, date] = day.split('-').map(Number);
  return { year, month, date };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function startOfMonth(day: string): string {
  const { year, month } = parts(day);
  return `${year}-${pad(month)}-01`;
}

export function daysInMonth(day: string): number {
  const { year, month } = parts(day);
  return new Date(year, month, 0).getDate();
}

/** 0 is Sunday, as for `Date.getDay`. */
export function weekdayOf(day: string): number {
  const { year, month, date } = parts(day);
  return new Date(year, month - 1, date).getDay();
}

/** The same day number in another month, or the last day when that month is shorter. */
export function shiftMonth(day: string, delta: number): string {
  const { year, month, date } = parts(day);
  const target = new Date(year, month - 1 + delta, 1);
  const first = toDayString(target);
  return `${startOfMonth(first).slice(0, 8)}${pad(Math.min(date, daysInMonth(first)))}`;
}

/** Weeks of the month holding `day`, padded with the days around it. `firstDay` is 0 for Sunday, 1 for Monday. */
export function monthGrid(day: string, firstDay: number): CalendarDay[][] {
  const first = startOfMonth(day);
  const lead = (weekdayOf(first) - firstDay + 7) % 7;
  const weeks = Math.ceil((lead + daysInMonth(first)) / 7);
  const start = addDays(first, -lead);
  const month = first.slice(0, 7);

  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, index) => {
      const value = addDays(start, week * 7 + index);
      return { day: value, inMonth: value.startsWith(month) };
    })
  );
}

export function startOfWeek(day: string, firstDay: number): string {
  return addDays(day, -((weekdayOf(day) - firstDay + 7) % 7));
}

/** Where a calendar key moves focus, or `null` for keys that do not move it. */
export function moveFocus(
  day: string,
  key: string,
  firstDay: number,
  shift = false
): string | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(day, -1);
    case 'ArrowRight':
      return addDays(day, 1);
    case 'ArrowUp':
      return addDays(day, -7);
    case 'ArrowDown':
      return addDays(day, 7);
    case 'Home':
      return startOfWeek(day, firstDay);
    case 'End':
      return addDays(startOfWeek(day, firstDay), 6);
    case 'PageUp':
      return shiftMonth(day, shift ? -12 : -1);
    case 'PageDown':
      return shiftMonth(day, shift ? 12 : 1);
    default:
      return null;
  }
}

/** The first day of the week where the person lives: 0 for Sunday, 1 for Monday, 6 for Saturday. */
export function firstDayOfWeek(locale?: string): number {
  try {
    const intl = new Intl.Locale(locale ?? navigator.language) as Intl.Locale & {
      weekInfo?: { firstDay: number };
      getWeekInfo?: () => { firstDay: number };
    };
    const info = intl.getWeekInfo?.() ?? intl.weekInfo;
    if (info) {
      return info.firstDay % 7;
    }
  } catch {
    // An unknown locale falls back to Monday, like most of the world.
  }
  return 1;
}

export function weekdayNames(
  firstDay: number
): Array<{ narrow: string; short: string; long: string }> {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(2023, 0, 1 + ((firstDay + index) % 7));
    return {
      narrow: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
      short: date.toLocaleDateString(undefined, { weekday: 'short' }),
      long: date.toLocaleDateString(undefined, { weekday: 'long' }),
    };
  });
}

export function monthTitle(day: string): string {
  const { year, month } = parts(day);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function dayTitle(day: string): string {
  const { year, month, date } = parts(day);
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

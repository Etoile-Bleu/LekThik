import { describe, expect, it } from 'vitest';

import {
  daysInMonth,
  monthGrid,
  moveFocus,
  shiftMonth,
  startOfMonth,
  startOfWeek,
  weekdayNames,
  weekdayOf,
} from './calendar';

describe('calendar maths', () => {
  it('finds the weekday, the month start and its length', () => {
    expect(weekdayOf('2026-10-22')).toBe(4);
    expect(startOfMonth('2026-10-22')).toBe('2026-10-01');
    expect(daysInMonth('2026-02-10')).toBe(28);
    expect(daysInMonth('2028-02-10')).toBe(29);
  });

  it('builds whole weeks that start on the chosen day', () => {
    const monday = monthGrid('2026-10-22', 1);
    expect(monday.every((week) => week.length === 7)).toBe(true);
    expect(weekdayOf(monday[0][0].day)).toBe(1);
    expect(monday[0][0].day).toBe('2026-09-28');
    expect(monday[0][3]).toEqual({ day: '2026-10-01', inMonth: true });
    expect(monday[0][0].inMonth).toBe(false);
    expect(monday.at(-1)?.at(-1)?.day).toBe('2026-11-01');

    const sunday = monthGrid('2026-10-22', 0);
    expect(weekdayOf(sunday[0][0].day)).toBe(0);
  });

  it('uses only the weeks the month needs', () => {
    expect(monthGrid('2027-02-15', 1)).toHaveLength(4);
    expect(monthGrid('2026-08-15', 1)).toHaveLength(6);
  });

  it('keeps every day of the month exactly once', () => {
    const inMonth = monthGrid('2028-02-10', 1)
      .flat()
      .filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(new Set(inMonth.map((cell) => cell.day)).size).toBe(29);
  });

  it('shifts months without overflowing the shorter ones', () => {
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28');
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15');
    expect(shiftMonth('2026-01-15', -1)).toBe('2025-12-15');
    expect(shiftMonth('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('finds the start of a week', () => {
    expect(startOfWeek('2026-10-22', 1)).toBe('2026-10-19');
    expect(startOfWeek('2026-10-22', 0)).toBe('2026-10-18');
    expect(startOfWeek('2026-10-19', 1)).toBe('2026-10-19');
  });

  it('moves focus the way a grid expects', () => {
    const day = '2026-10-22';
    expect(moveFocus(day, 'ArrowRight', 1)).toBe('2026-10-23');
    expect(moveFocus(day, 'ArrowLeft', 1)).toBe('2026-10-21');
    expect(moveFocus(day, 'ArrowDown', 1)).toBe('2026-10-29');
    expect(moveFocus(day, 'ArrowUp', 1)).toBe('2026-10-15');
    expect(moveFocus(day, 'Home', 1)).toBe('2026-10-19');
    expect(moveFocus(day, 'End', 1)).toBe('2026-10-25');
    expect(moveFocus(day, 'PageDown', 1)).toBe('2026-11-22');
    expect(moveFocus(day, 'PageUp', 1)).toBe('2026-09-22');
    expect(moveFocus(day, 'PageDown', 1, true)).toBe('2027-10-22');
    expect(moveFocus(day, 'a', 1)).toBeNull();
  });

  it('crosses month and year edges when moving by a day', () => {
    expect(moveFocus('2026-12-31', 'ArrowRight', 1)).toBe('2027-01-01');
    expect(moveFocus('2026-03-01', 'ArrowLeft', 1)).toBe('2026-02-28');
  });

  it('names seven weekdays starting on the chosen day', () => {
    const names = weekdayNames(1);
    expect(names).toHaveLength(7);
    expect(new Set(names.map((name) => name.long)).size).toBe(7);
    expect(names[0].long).not.toBe(weekdayNames(0)[0].long);
    expect(names[6].long).toBe(weekdayNames(0)[0].long);
  });
});

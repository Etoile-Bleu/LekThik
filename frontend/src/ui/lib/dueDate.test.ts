import { describe, expect, it } from 'vitest';

import { addDays, daysUntil, describeDue, dueState, shortDue, toDayString } from './dueDate';

const TODAY = '2026-10-22';

describe('dueDate', () => {
  it('formats a local day without shifting it through UTC', () => {
    expect(toDayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('counts whole days between calendar days, across months and years', () => {
    expect(daysUntil('2026-10-23', TODAY)).toBe(1);
    expect(daysUntil('2026-11-01', TODAY)).toBe(10);
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2026-10-20', TODAY)).toBe(-2);
  });

  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-10-22', 7)).toBe('2026-10-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('classifies a day against today', () => {
    expect(dueState('2026-10-21', TODAY)).toBe('overdue');
    expect(dueState('2026-10-22', TODAY)).toBe('today');
    expect(dueState('2026-10-25', TODAY)).toBe('soon');
    expect(dueState('2026-10-26', TODAY)).toBe('later');
  });

  it('writes the nearest days in words', () => {
    expect(shortDue('2026-10-22', TODAY)).toBe('Today');
    expect(shortDue('2026-10-23', TODAY)).toBe('Tomorrow');
    expect(shortDue('2026-10-21', TODAY)).toBe('Yesterday');
  });

  it('adds the year only when it differs', () => {
    expect(shortDue('2026-12-25', TODAY)).not.toContain('2026');
    expect(shortDue('2027-01-15', TODAY)).toContain('2027');
  });

  it('states the urgency in words for assistive technology', () => {
    expect(describeDue('2026-10-20', TODAY)).toMatch(/^Overdue, /);
    expect(describeDue('2026-10-22', TODAY)).toMatch(/^Due today, /);
    expect(describeDue('2026-11-30', TODAY)).toMatch(/^Due, /);
  });
});

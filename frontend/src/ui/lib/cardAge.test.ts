import { describe, expect, it } from 'vitest';

import {
  AGE_NOTICE_MS,
  AGE_STALE_MS,
  ageState,
  describeAge,
  describeBlocked,
  enteredOn,
  isNoteworthyAge,
  longElapsed,
  shortElapsed,
} from './cardAge';

const NOW = new Date('2026-10-22T12:00:00Z').getTime();

function hoursAgo(hours: number): string {
  return new Date(NOW - hours * 3_600_000).toISOString();
}

describe('cardAge', () => {
  it('writes compact badge text across every unit', () => {
    expect(shortElapsed(hoursAgo(0.5), NOW)).toBe('30m');
    expect(shortElapsed(hoursAgo(2), NOW)).toBe('2h');
    expect(shortElapsed(hoursAgo(48), NOW)).toBe('2d');
    expect(shortElapsed(hoursAgo(24 * 14), NOW)).toBe('2w');
    expect(shortElapsed(hoursAgo(24 * 61), NOW)).toBe('2mo');
    expect(shortElapsed(hoursAgo(24 * 731), NOW)).toBe('2y');
  });

  it('never goes negative for a timestamp from the future', () => {
    expect(shortElapsed(hoursAgo(-5), NOW)).toBe('now');
  });

  it('writes the full phrase with correct singular and plural', () => {
    expect(longElapsed(hoursAgo(1), NOW)).toBe('1 hour');
    expect(longElapsed(hoursAgo(48), NOW)).toBe('2 days');
    expect(longElapsed(hoursAgo(24 * 14), NOW)).toBe('2 weeks');
  });

  it('is not noteworthy until the threshold, then flags stale past the second one', () => {
    expect(isNoteworthyAge(hoursAgo(AGE_NOTICE_MS / 3_600_000 - 1), NOW)).toBe(false);
    expect(isNoteworthyAge(hoursAgo(AGE_NOTICE_MS / 3_600_000 + 1), NOW)).toBe(true);
    expect(ageState(hoursAgo(AGE_STALE_MS / 3_600_000 - 1), NOW)).toBe('normal');
    expect(ageState(hoursAgo(AGE_STALE_MS / 3_600_000 + 1), NOW)).toBe('stale');
  });

  it('adds the year to a calendar date only when it differs', () => {
    expect(enteredOn(hoursAgo(1), NOW)).not.toContain('2026');
    expect(enteredOn('2024-01-05T00:00:00Z', NOW)).toContain('2024');
  });

  it('describes a card age for screen readers', () => {
    expect(describeAge(hoursAgo(48), NOW)).toMatch(/^In this list for 2 days, since /);
  });

  it('describes a blocked card, with and without a reason', () => {
    expect(describeBlocked(hoursAgo(48), NOW, 'Waiting on design')).toBe(
      'Blocked for 2 days: Waiting on design'
    );
    expect(describeBlocked(hoursAgo(48), NOW, null)).toBe('Blocked for 2 days');
  });
});

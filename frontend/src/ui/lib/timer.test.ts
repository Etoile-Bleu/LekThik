import { describe, expect, it } from 'vitest';

import type { TimerConfig } from './boardsApi';
import {
  MINUTE,
  advance,
  extend,
  formatClock,
  lengthMs,
  milestone,
  nextAfter,
  pause,
  progressOf,
  remainingMs,
  reset,
  spokenDuration,
  start,
  statusOf,
  switchMode,
} from './timer';

const idle: TimerConfig = {
  size: 'normal',
  mode: 'focus',
  focus_minutes: 25,
  short_minutes: 5,
  long_minutes: 15,
  state: 'idle',
  ends_at_ms: null,
  remaining_ms: null,
  cycle: 0,
};

const T0 = 1_800_000_000_000;

describe('reading the time left', () => {
  it('is the whole length when idle, and follows the end time while running', () => {
    expect(remainingMs(idle, T0)).toBe(25 * MINUTE);
    const running = start(idle, T0);

    expect(remainingMs(running, T0)).toBe(25 * MINUTE);
    expect(remainingMs(running, T0 + 10 * MINUTE)).toBe(15 * MINUTE);
    expect(remainingMs(running, T0 + 99 * MINUTE)).toBe(0);
  });

  it('gives every device the same answer from the same end time, whenever it looks', () => {
    const running = start(idle, T0);

    expect(remainingMs(running, T0 + 61_000)).toBe(25 * MINUTE - 61_000);
    expect(remainingMs(running, T0 + 61_000)).toBe(remainingMs({ ...running }, T0 + 61_000));
  });

  it('is done when a running timer reaches its end, even for a device that was asleep', () => {
    const running = start(idle, T0);

    expect(statusOf(running, T0 + 25 * MINUTE - 1)).toBe('running');
    expect(statusOf(running, T0 + 25 * MINUTE)).toBe('done');
    expect(statusOf(running, T0 + 8 * 3_600_000)).toBe('done');
    expect(statusOf(idle, T0)).toBe('idle');
  });

  it('writes the clock rounding up, so it never shows 00:00 before the end', () => {
    expect(formatClock(25 * MINUTE)).toBe('25:00');
    expect(formatClock(59_001)).toBe('01:00');
    expect(formatClock(999)).toBe('00:01');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-50)).toBe('00:00');
    expect(formatClock(125 * MINUTE)).toBe('125:00');
  });

  it('says a duration in words', () => {
    expect(spokenDuration(90_000)).toBe('1 minute 30 seconds');
    expect(spokenDuration(5 * MINUTE)).toBe('5 minutes');
    expect(spokenDuration(1000)).toBe('1 second');
    expect(spokenDuration(0)).toBe('0 seconds');
  });

  it('draws the share elapsed', () => {
    const running = start(idle, T0);

    expect(progressOf(idle, T0)).toBe(0);
    expect(progressOf(running, T0 + 5 * MINUTE)).toBeCloseTo(0.2);
    expect(progressOf(running, T0 + 40 * MINUTE)).toBe(1);
  });
});

describe('the writer actions', () => {
  it('starts from the end time, never from a count of ticks', () => {
    const running = start(idle, T0);

    expect(running).toMatchObject({
      state: 'running',
      ends_at_ms: T0 + 25 * MINUTE,
      remaining_ms: null,
    });
  });

  it('pauses with the time left and resumes from it', () => {
    const paused = pause(start(idle, T0), T0 + 10 * MINUTE);

    expect(paused).toMatchObject({ state: 'paused', ends_at_ms: null, remaining_ms: 15 * MINUTE });
    expect(remainingMs(paused, T0 + 3 * 3_600_000)).toBe(15 * MINUTE);

    const resumed = start(paused, T0 + 20 * MINUTE);
    expect(resumed.ends_at_ms).toBe(T0 + 35 * MINUTE);
  });

  it('never pauses on zero, which the server would refuse', () => {
    const paused = pause(start(idle, T0), T0 + 30 * MINUTE);

    expect(paused.remaining_ms).toBe(1);
  });

  it('adds five minutes while running or paused, up to four hours, and does nothing when idle', () => {
    const running = start(idle, T0);

    expect(extend(running, T0 + 5 * MINUTE).ends_at_ms).toBe(T0 + 5 * MINUTE + 25 * MINUTE);
    expect(extend(pause(running, T0 + 5 * MINUTE), T0).remaining_ms).toBe(25 * MINUTE);
    expect(extend(idle, T0)).toBe(idle);
    const long = { ...idle, state: 'paused' as const, remaining_ms: 239 * MINUTE };
    expect(extend(long, T0).remaining_ms).toBe(240 * MINUTE);
  });

  it('resets to the full length and switches mode', () => {
    const running = start(idle, T0);

    expect(reset(running)).toMatchObject({ state: 'idle', ends_at_ms: null, mode: 'focus' });
    expect(switchMode(running, 'short_break')).toMatchObject({
      state: 'idle',
      mode: 'short_break',
      ends_at_ms: null,
    });
    expect(lengthMs(switchMode(idle, 'long_break'))).toBe(15 * MINUTE);
  });
});

describe('what comes after', () => {
  it('goes to a short break, and to a long one after every fourth focus', () => {
    expect(nextAfter(idle)).toEqual({ mode: 'short_break', cycle: 1 });
    expect(nextAfter({ ...idle, cycle: 3 })).toEqual({ mode: 'long_break', cycle: 4 });
    expect(nextAfter({ ...idle, cycle: 4 })).toEqual({ mode: 'short_break', cycle: 5 });
  });

  it('goes back to focus after a break without counting a session', () => {
    expect(nextAfter({ ...idle, mode: 'short_break', cycle: 2 })).toEqual({
      mode: 'focus',
      cycle: 2,
    });
    expect(advance(start(idle, T0))).toMatchObject({
      state: 'idle',
      mode: 'short_break',
      cycle: 1,
      ends_at_ms: null,
    });
  });
});

describe('what is announced', () => {
  const running = start(idle, T0);

  it('speaks at each five minutes and at one minute, not every second', () => {
    expect(milestone(running, 10 * MINUTE + 1000, 10 * MINUTE)).toBe('10 minutes left.');
    expect(milestone(running, 5 * MINUTE + 1000, 5 * MINUTE - 500)).toBe('5 minutes left.');
    expect(milestone(running, MINUTE + 1000, MINUTE)).toBe('One minute left.');
    expect(milestone(running, 9 * MINUTE, 8 * MINUTE)).toBeNull();
    expect(milestone(running, 12 * MINUTE, 11 * MINUTE + 59_000)).toBeNull();
  });

  it('speaks once when it ends, naming what ended', () => {
    expect(milestone(running, 900, 0)).toBe('Focus is over.');
    expect(milestone({ ...running, mode: 'long_break' }, 900, 0)).toBe('Long break is over.');
    expect(milestone(running, 0, 0)).toBeNull();
  });

  it('speaks only the nearest mark after a gap, and not at all when it is not running', () => {
    expect(milestone(running, 22 * MINUTE, 4 * MINUTE)).toBe('5 minutes left.');
    expect(milestone(idle, 10 * MINUTE + 1000, 10 * MINUTE)).toBeNull();
  });
});

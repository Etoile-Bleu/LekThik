import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnnouncer } from '@lib/announcer';
import type { BoardList, TimerConfig } from '@lib/boardsApi';
import { resetServerClock } from '@lib/serverClock';

import { TimerBlock } from './TimerBlock';

const T0 = Date.parse('2026-10-27T12:00:00Z');
const MINUTE = 60_000;

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

function block(config: Partial<TimerConfig>): BoardList {
  return {
    id: 'tmr',
    name: 'Focus',
    wip_limit: null,
    kind: 'timer',
    config: { ...idle, ...config },
    cards: [],
  };
}

function renderTimer(config: Partial<TimerConfig>, editable = true) {
  const onSave = vi.fn();
  const view = render(<TimerBlock block={block(config)} editable={editable} onSave={onSave} />);
  return { onSave, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(T0);
  useAnnouncer.setState({ message: '', tick: 0 });
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  resetServerClock();
});

describe('TimerBlock when it is idle', () => {
  it('shows the length of the mode and starts from the end time', () => {
    const { onSave } = renderTimer({});

    expect(screen.getByRole('timer', { name: 'Focus timer' })).toHaveTextContent('25:00');
    expect(screen.getByText('Ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    expect(onSave).toHaveBeenCalledWith('tmr', {
      ...idle,
      state: 'running',
      ends_at_ms: T0 + 25 * MINUTE,
      remaining_ms: null,
    });
  });

  it('switches mode to a break with its own length', () => {
    const { onSave } = renderTimer({});

    fireEvent.click(screen.getByRole('button', { name: 'Short break' }));

    expect(onSave).toHaveBeenCalledWith('tmr', { ...idle, mode: 'short_break' });
  });

  it('has nothing to reset or extend', () => {
    renderTimer({});

    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+5 min' })).toBeDisabled();
  });
});

describe('TimerBlock while it runs', () => {
  const running = { state: 'running' as const, ends_at_ms: T0 + 10 * MINUTE + 30_000 };

  it('counts down from the shared end time and follows the clock', () => {
    renderTimer(running);

    expect(screen.getByRole('timer')).toHaveTextContent('10:30');
    act(() => {
      vi.setSystemTime(T0 + 60_000);
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('timer')).toHaveTextContent('09:30');
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('pauses with the time left, and cannot change mode while running', () => {
    const { onSave } = renderTimer(running);

    expect(screen.getByRole('button', { name: 'Short break' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(onSave).toHaveBeenCalledWith('tmr', {
      ...idle,
      state: 'paused',
      ends_at_ms: null,
      remaining_ms: 10 * MINUTE + 30_000,
    });
  });

  it('adds five minutes to the end time', () => {
    const { onSave } = renderTimer(running);

    fireEvent.click(screen.getByRole('button', { name: '+5 min' }));

    expect(onSave).toHaveBeenCalledWith(
      'tmr',
      expect.objectContaining({ ends_at_ms: T0 + 15 * MINUTE + 30_000 })
    );
  });

  it('announces the start, the five minute marks and the end, not every second', () => {
    const { rerender } = renderTimer({ state: 'idle' });
    const announced: string[] = [];
    const unsubscribe = useAnnouncer.subscribe((state) => announced.push(state.message));

    rerender(
      <TimerBlock
        block={block({ state: 'running', ends_at_ms: T0 + 5 * MINUTE + 2000 })}
        editable
        onSave={vi.fn()}
      />
    );
    expect(announced.at(-1)).toBe('Focus started, 5 minutes 2 seconds left.');

    act(() => {
      vi.setSystemTime(T0 + 3000);
      vi.advanceTimersByTime(300);
    });
    expect(announced.at(-1)).toBe('5 minutes left.');

    const count = announced.length;
    act(() => {
      vi.setSystemTime(T0 + 3000 + 20_000);
      vi.advanceTimersByTime(300);
    });
    expect(announced).toHaveLength(count);
    unsubscribe();
  });
});

describe('TimerBlock when time is up', () => {
  it('says so once, with an alert, and offers the next step', () => {
    const { onSave } = renderTimer({ state: 'running', ends_at_ms: T0 + 1000 });
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();

    act(() => {
      vi.setSystemTime(T0 + 1500);
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Focus is over.');
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
    expect(screen.getByText('Time is up')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start short break' }));
    expect(onSave).toHaveBeenCalledWith(
      'tmr',
      expect.objectContaining({
        mode: 'short_break',
        cycle: 1,
        state: 'running',
        ends_at_ms: expect.any(Number),
      })
    );
  });

  it('does not announce an end that happened while nobody was looking', () => {
    renderTimer({ state: 'running', ends_at_ms: T0 - 5000 });

    expect(screen.getByText('Time is up')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeEmptyDOMElement();
  });
});

describe('TimerBlock for a reader', () => {
  it('shows the same time and no way to change it', () => {
    renderTimer({ state: 'running', ends_at_ms: T0 + 12 * MINUTE }, false);

    expect(screen.getByRole('timer')).toHaveTextContent('12:00');
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Short break' })).toBeNull();
    expect(screen.getByText(/Only people who can edit it start or stop it/)).toBeInTheDocument();
  });
});

describe('TimerBlock sessions and sound', () => {
  it('counts the focus sessions of the round', () => {
    renderTimer({ cycle: 2 });

    expect(screen.getByRole('list', { name: 'Session 3 of 4' })).toBeInTheDocument();
    expect(document.querySelectorAll('.timer-block__sessions li[data-done]')).toHaveLength(2);
  });

  it('keeps the choice of a sound on this device only', () => {
    renderTimer({});

    fireEvent.click(screen.getByRole('checkbox', { name: /Play a sound when it ends/ }));

    expect(window.localStorage.getItem('lekthik.timer.sound.v1')).toBe('on');
  });
});

import type { TimerConfig, TimerMode } from './boardsApi';

export const MINUTE = 60_000;
export const EXTEND_MINUTES = 5;
export const MAX_TOTAL_MS = 4 * 3_600_000;
export const LONG_BREAK_EVERY = 4;

export const MODE_LABEL: Record<TimerMode, string> = {
  focus: 'Focus',
  short_break: 'Short break',
  long_break: 'Long break',
};

export const MODE_ORDER: TimerMode[] = ['focus', 'short_break', 'long_break'];

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

export function lengthMs(config: TimerConfig, mode: TimerMode = config.mode): number {
  const minutes =
    mode === 'focus'
      ? config.focus_minutes
      : mode === 'short_break'
        ? config.short_minutes
        : config.long_minutes;
  return minutes * MINUTE;
}

export function remainingMs(config: TimerConfig, now: number): number {
  switch (config.state) {
    case 'running':
      return Math.max(0, (config.ends_at_ms ?? now) - now);
    case 'paused':
      return config.remaining_ms ?? lengthMs(config);
    default:
      return lengthMs(config);
  }
}

export function statusOf(config: TimerConfig, now: number): TimerStatus {
  if (config.state === 'running' && remainingMs(config, now) === 0) return 'done';
  return config.state;
}

export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function spokenDuration(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const parts = [
    minutes > 0 ? `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}` : '',
    rest > 0 ? `${rest} ${rest === 1 ? 'second' : 'seconds'}` : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '0 seconds';
}

export function progressOf(config: TimerConfig, now: number): number {
  const total = lengthMs(config);
  if (config.state === 'idle') return 0;
  const left = remainingMs(config, now);
  return Math.min(1, Math.max(0, 1 - left / Math.max(total, left)));
}

export function start(config: TimerConfig, now: number): TimerConfig {
  return {
    ...config,
    state: 'running',
    ends_at_ms: now + remainingMs(config, now),
    remaining_ms: null,
  };
}

export function pause(config: TimerConfig, now: number): TimerConfig {
  const left = Math.max(1, remainingMs(config, now));
  return { ...config, state: 'paused', ends_at_ms: null, remaining_ms: left };
}

export function reset(config: TimerConfig): TimerConfig {
  return { ...config, state: 'idle', ends_at_ms: null, remaining_ms: null };
}

export function extend(config: TimerConfig, now: number): TimerConfig {
  const more = EXTEND_MINUTES * MINUTE;
  if (config.state === 'running') {
    const left = remainingMs(config, now);
    const next = Math.min(left + more, MAX_TOTAL_MS);
    return { ...config, ends_at_ms: now + next };
  }
  if (config.state === 'paused') {
    return { ...config, remaining_ms: Math.min((config.remaining_ms ?? 0) + more, MAX_TOTAL_MS) };
  }
  return config;
}

export function switchMode(config: TimerConfig, mode: TimerMode): TimerConfig {
  return { ...reset(config), mode };
}

export function nextAfter(config: TimerConfig): { mode: TimerMode; cycle: number } {
  if (config.mode !== 'focus') return { mode: 'focus', cycle: config.cycle };
  const cycle = config.cycle + 1;
  return { mode: cycle % LONG_BREAK_EVERY === 0 ? 'long_break' : 'short_break', cycle };
}

export function advance(config: TimerConfig): TimerConfig {
  const { mode, cycle } = nextAfter(config);
  return { ...reset(config), mode, cycle };
}

export function milestone(config: TimerConfig, before: number, after: number): string | null {
  if (config.state !== 'running') return null;
  if (after === 0 && before > 0) return `${MODE_LABEL[config.mode]} is over.`;
  const crossed = MILESTONES.filter((mark) => before > mark * MINUTE && after <= mark * MINUTE);
  if (crossed.length === 0) return null;
  const nearest = Math.min(...crossed);
  return nearest === 1 ? 'One minute left.' : `${nearest} minutes left.`;
}

const MILESTONES = [1, ...Array.from({ length: 24 }, (_, index) => (index + 1) * 5)];

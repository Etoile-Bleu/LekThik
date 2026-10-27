import { useEffect, useId, useRef, useState } from 'react';

import { announce } from '@lib/announcer';
import { timerConfig } from '@lib/blocks';
import type { BoardList, TimerConfig, TimerMode } from '@lib/boardsApi';
import { serverNow } from '@lib/serverClock';
import {
  LONG_BREAK_EVERY,
  MODE_LABEL,
  MODE_ORDER,
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
} from '@lib/timer';
import { chime, setSoundEnabled, soundEnabled } from '@lib/timerSound';

import './TimerBlock.css';

interface TimerBlockProps {
  block: BoardList;
  editable: boolean;
  onSave: (blockId: string, config: TimerConfig) => void;
}

const TICK_MS = 250;

export function TimerBlock({ block, editable, onSave }: TimerBlockProps) {
  const config = timerConfig(block);
  const [now, setNow] = useState(() => serverNow());
  const [sound, setSound] = useState(() => soundEnabled());
  const [over, setOver] = useState('');
  const soundId = useId();
  const previous = useRef({ state: config.state, status: statusOf(config, serverNow()), left: 0 });

  useEffect(() => {
    if (config.state !== 'running') {
      setNow(serverNow());
      return undefined;
    }
    const tick = () => setNow(serverNow());
    tick();
    const timer = window.setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [config.state, config.ends_at_ms]);

  const left = remainingMs(config, now);
  const status = statusOf(config, now);
  const progress = progressOf(config, now);

  useEffect(() => {
    const was = previous.current;
    if (was.state !== config.state) {
      const what = MODE_LABEL[config.mode];
      if (config.state === 'running') announce(`${what} started, ${spokenDuration(left)} left.`);
      else if (config.state === 'paused') announce(`${what} paused, ${spokenDuration(left)} left.`);
      else announce(`${what} reset to ${spokenDuration(lengthMs(config))}.`);
      setOver('');
    } else if (was.status === 'running' && status === 'done') {
      setOver(`${MODE_LABEL[config.mode]} is over.`);
      if (sound) chime();
    } else if (status === 'running') {
      const said = milestone(config, was.left, left);
      if (said) announce(said);
    }
    previous.current = { state: config.state, status, left };
  }, [config, left, status, sound]);

  function save(next: TimerConfig) {
    onSave(block.id, next);
  }

  const upcoming = nextAfter(config);
  const finished = status === 'done';
  const primary = finished
    ? {
        label: `Start ${MODE_LABEL[upcoming.mode].toLowerCase()}`,
        run: () => save(start(advance(config), serverNow())),
      }
    : status === 'running'
      ? { label: 'Pause', run: () => save(pause(config, serverNow())) }
      : {
          label: status === 'paused' ? 'Resume' : 'Start',
          run: () => save(start(config, serverNow())),
        };
  const session = (config.cycle % LONG_BREAK_EVERY) + (config.mode === 'focus' ? 1 : 0);

  return (
    <div className="timer-block" data-status={status} data-mode={config.mode}>
      <p className="sr-only" role="alert">
        {over}
      </p>

      <div className="timer-block__dial">
        <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
          <circle className="timer-block__track" cx="60" cy="60" r="52" pathLength={100} />
          <circle
            className="timer-block__elapsed"
            cx="60"
            cy="60"
            r="52"
            pathLength={100}
            style={{ strokeDashoffset: 100 - progress * 100 }}
          />
        </svg>
        <div className="timer-block__face">
          <span className="timer-block__mode">{MODE_LABEL[config.mode]}</span>
          <span
            className="timer-block__time"
            role="timer"
            aria-label={`${MODE_LABEL[config.mode]} timer`}
          >
            {formatClock(left)}
          </span>
          <span className="timer-block__state">
            {finished
              ? 'Time is up'
              : status === 'paused'
                ? 'Paused'
                : status === 'running'
                  ? 'Running'
                  : 'Ready'}
          </span>
        </div>
      </div>

      <ol
        className="timer-block__sessions"
        aria-label={`Session ${session} of ${LONG_BREAK_EVERY}`}
      >
        {Array.from({ length: LONG_BREAK_EVERY }, (_, index) => (
          <li
            key={index}
            data-done={index < config.cycle % LONG_BREAK_EVERY || undefined}
            data-current={
              (config.mode === 'focus' && index === config.cycle % LONG_BREAK_EVERY) || undefined
            }
          />
        ))}
      </ol>

      {editable ? (
        <>
          <div className="timer-block__modes" role="group" aria-label="What to run">
            {MODE_ORDER.map((mode: TimerMode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={config.mode === mode}
                disabled={status === 'running'}
                onClick={() => save(switchMode(config, mode))}
              >
                {MODE_LABEL[mode]}
              </button>
            ))}
          </div>
          <div className="timer-block__actions">
            <button type="button" className="btn btn--primary" onClick={primary.run}>
              {primary.label}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              disabled={status === 'idle'}
              onClick={() => save(reset(config))}
            >
              Reset
            </button>
            <button
              type="button"
              className="btn btn--outline"
              disabled={status === 'idle' || finished}
              onClick={() => save(extend(config, serverNow()))}
            >
              +5 min
            </button>
          </div>
        </>
      ) : (
        <p className="timer-block__note">
          Everyone on the board sees the same time. Only people who can edit it start or stop it.
        </p>
      )}

      <div className="timer-block__sound">
        <input
          id={soundId}
          type="checkbox"
          checked={sound}
          onChange={(event) => {
            setSound(event.target.checked);
            setSoundEnabled(event.target.checked);
          }}
        />
        <label htmlFor={soundId}>Play a sound when it ends (this device only)</label>
      </div>
    </div>
  );
}

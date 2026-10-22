import { type LiveStatus, useLiveStore } from '@lib/realtime';

import './LiveIndicator.css';

const COPY: Record<LiveStatus, { label: string; detail: string }> = {
  off: { label: 'Offline', detail: 'Live updates are off. Reload to reconnect.' },
  connecting: { label: 'Connecting', detail: 'Connecting to live updates.' },
  live: { label: 'Live', detail: 'Changes from your teammates appear as they happen.' },
  reconnecting: { label: 'Reconnecting', detail: 'Connection lost, trying again.' },
};

/** Tells people whether what they see is being kept up to date. */
export function LiveIndicator() {
  const status = useLiveStore((state) => state.status);
  const copy = COPY[status];

  return (
    <span className="live" data-status={status} title={copy.detail}>
      <span className="live__dot" aria-hidden="true" />
      <span className="live__label">{copy.label}</span>
      <span className="sr-only" role="status">
        {copy.detail}
      </span>
    </span>
  );
}

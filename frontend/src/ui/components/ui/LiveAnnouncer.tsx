import { useAnnouncer } from '@lib/announcer';

/** Visually hidden, polite, and rewritten each time so repeated messages are spoken. */
export function LiveAnnouncer() {
  const message = useAnnouncer((state) => state.message);
  const tick = useAnnouncer((state) => state.tick);

  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      <span key={tick}>{message}</span>
    </div>
  );
}

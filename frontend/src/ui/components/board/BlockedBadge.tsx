import { describeBlocked } from '@lib/cardAge';

import { BlockedIcon } from '../ui/Icons';
import './BlockedBadge.css';

/**
 * The state is said three ways, never by colour alone: the word ("Blocked"),
 * the stop-sign icon, and the sentence a screen reader gets, which also
 * carries the reason when there is one.
 */
export function BlockedBadge({
  since,
  reason,
  now,
}: {
  since: string;
  reason: string | null;
  now: number;
}) {
  return (
    <span className="blocked-badge" title={describeBlocked(since, now, reason)}>
      <BlockedIcon size={13} />
      <span aria-hidden="true">Blocked</span>
      <span className="sr-only">{describeBlocked(since, now, reason)}</span>
    </span>
  );
}

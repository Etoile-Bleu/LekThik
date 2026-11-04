import { ageState, describeAge, isNoteworthyAge, shortElapsed } from '@lib/cardAge';

import { ClockIcon } from '../ui/Icons';
import './AgeBadge.css';

/**
 * How long a card has sat in its current list. Says nothing for a fresh
 * card; once it has sat a while the badge appears, quietly at first, then
 * in the stale colour once it has sat long enough to be worth a look.
 * `now` comes from the caller's own clock, so a whole board of badges ticks
 * from one timer instead of one each.
 */
export function AgeBadge({ since, now }: { since: string; now: number }) {
  if (!isNoteworthyAge(since, now)) {
    return null;
  }

  const state = ageState(since, now);

  return (
    <span className="age-badge" data-state={state} title={describeAge(since, now)}>
      <ClockIcon size={13} />
      <span aria-hidden="true">{shortElapsed(since, now)}</span>
      <span className="sr-only">{describeAge(since, now)}</span>
    </span>
  );
}

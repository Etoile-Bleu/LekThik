import { useBoardMeta } from '@hooks/useBoardMeta';
import { describeDue, dueState, shortDue } from '@lib/dueDate';

import { AlertIcon, CalendarIcon } from '../ui/Icons';
import './DueBadge.css';

/**
 * The state is said three ways, never by colour alone: the wording (Today,
 * Yesterday, a date), the icon (a warning triangle once overdue) and the
 * sentence read out by screen readers.
 */
export function DueBadge({ day }: { day: string }) {
  const { today } = useBoardMeta();
  const state = dueState(day, today);
  const Icon = state === 'overdue' ? AlertIcon : CalendarIcon;

  return (
    <span className="due-badge" data-state={state} title={describeDue(day, today)} key={day}>
      <Icon size={14} />
      <span aria-hidden="true">{shortDue(day, today)}</span>
      <span className="sr-only">{describeDue(day, today)}</span>
    </span>
  );
}

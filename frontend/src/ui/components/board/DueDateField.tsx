import { useBoardMeta } from '@hooks/useBoardMeta';
import { addDays, describeDue } from '@lib/dueDate';

import { DueBadge } from './DueBadge';
import './DueDateField.css';

interface DueDateFieldProps {
  value: string | null;
  editable: boolean;
  onChange: (day: string | null) => void;
}

/** The value part of the "Due date" row. */
export function DueDateField({ value, editable, onChange }: DueDateFieldProps) {
  const { today } = useBoardMeta();

  if (!editable) {
    return value ? (
      <span className="due-field__readonly">
        <DueBadge day={value} />
        <span>{describeDue(value, today)}</span>
      </span>
    ) : (
      <span className="due-field__none">No due date</span>
    );
  }

  const quickPicks = [
    { label: 'Today', day: today },
    { label: 'Tomorrow', day: addDays(today, 1) },
    { label: 'Next week', day: addDays(today, 7) },
  ];

  return (
    <>
      <input
        className="due-field__input"
        type="date"
        aria-label="Due date"
        value={value ?? ''}
        min="2000-01-01"
        max="2100-12-31"
        onChange={(event) => onChange(event.target.value || null)}
      />
      {value && (
        <span className="sr-only" role="status">
          {describeDue(value, today)}
        </span>
      )}
      <span className="due-field__quick" role="group" aria-label="Quick due dates">
        {quickPicks.map((pick) => (
          <button
            key={pick.label}
            type="button"
            className="due-field__chip"
            aria-pressed={value === pick.day}
            onClick={() => onChange(value === pick.day ? null : pick.day)}
          >
            {pick.label}
          </button>
        ))}
        {value && (
          <button
            type="button"
            className="due-field__chip due-field__chip--clear"
            onClick={() => onChange(null)}
          >
            Clear
          </button>
        )}
      </span>
    </>
  );
}

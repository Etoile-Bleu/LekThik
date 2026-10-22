import { useId } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { addDays, describeDue } from '@lib/dueDate';

import { DueBadge } from './DueBadge';
import './DueDateField.css';

interface DueDateFieldProps {
  value: string | null;
  editable: boolean;
  onChange: (day: string | null) => void;
}

export function DueDateField({ value, editable, onChange }: DueDateFieldProps) {
  const { today } = useBoardMeta();
  const inputId = useId();

  const quickPicks = [
    { label: 'Today', day: today },
    { label: 'Tomorrow', day: addDays(today, 1) },
    { label: 'Next week', day: addDays(today, 7) },
  ];

  if (!editable) {
    return (
      <div className="due-field">
        <span className="field-label">Due date</span>
        {value ? (
          <p className="due-field__readonly">
            <DueBadge day={value} />
            <span>{describeDue(value, today)}</span>
          </p>
        ) : (
          <p className="field-hint">No due date.</p>
        )}
      </div>
    );
  }

  return (
    <div className="due-field">
      <div className="field">
        <label htmlFor={inputId}>Due date</label>
        <input
          id={inputId}
          type="date"
          value={value ?? ''}
          min="2000-01-01"
          max="2100-12-31"
          onChange={(event) => onChange(event.target.value || null)}
        />
      </div>
      <div className="due-field__quick" role="group" aria-label="Quick due dates">
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
      </div>
      {value && (
        <p className="due-field__summary" role="status" aria-live="polite">
          {describeDue(value, today)}
        </p>
      )}
    </div>
  );
}

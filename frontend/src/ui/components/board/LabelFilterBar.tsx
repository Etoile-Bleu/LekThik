import type { Label } from '@lib/boardsApi';

import { LabelChip } from './LabelChip';
import './LabelFilterBar.css';

interface LabelFilterBarProps {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string) => void;
  onClear: () => void;
  matchCount: number;
  totalCount: number;
}

export function LabelFilterBar({
  labels,
  selected,
  onToggle,
  onClear,
  matchCount,
  totalCount,
}: LabelFilterBarProps) {
  if (labels.length === 0) {
    return null;
  }

  return (
    <div className="filter-bar" role="group" aria-label="Filter cards by label">
      <span className="filter-bar__title">Filter</span>
      <ul className="filter-bar__list">
        {labels.map((label) => {
          const pressed = selected.includes(label.id);
          return (
            <li key={label.id}>
              <button
                type="button"
                className="filter-bar__toggle"
                aria-pressed={pressed}
                onClick={() => onToggle(label.id)}
              >
                <LabelChip name={label.name} color={label.color} priority={label.priority} />
              </button>
            </li>
          );
        })}
      </ul>
      {selected.length > 0 && (
        <div className="filter-bar__summary">
          <span role="status" aria-live="polite">
            {matchCount} of {totalCount} cards match
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClear}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

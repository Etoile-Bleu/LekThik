import { type ReactNode, useId } from 'react';

import { type CardFilter, EMPTY_FILTER, isFiltering } from '@lib/boardModel';
import type { Field, Label } from '@lib/boardsApi';

import { CheckIcon } from '../ui/Icons';
import { LabelChip } from './LabelChip';
import './FilterBar.css';

interface FilterBarProps {
  labels: Label[];
  fields?: Field[];
  filter: CardFilter;
  onChange: (filter: CardFilter) => void;
  matchCount: number;
  totalCount: number;
  /** The view switcher, kept with the filters because both shape what the board shows. */
  leading?: ReactNode;
}

interface PillProps {
  pressed: boolean;
  onToggle: () => void;
  children: string;
}

function Pill({ pressed, onToggle, children }: PillProps) {
  return (
    <button type="button" className="filter-pill" aria-pressed={pressed} onClick={onToggle}>
      <span className="filter-pill__check" aria-hidden="true">
        <CheckIcon size={12} />
      </span>
      {children}
    </button>
  );
}

export function FilterBar({
  labels,
  fields = [],
  filter,
  onChange,
  matchCount,
  totalCount,
  leading,
}: FilterBarProps) {
  const labelsHeading = useId();

  function toggleLabel(labelId: string) {
    onChange({
      ...filter,
      labelIds: filter.labelIds.includes(labelId)
        ? filter.labelIds.filter((id) => id !== labelId)
        : [...filter.labelIds, labelId],
    });
  }

  const selectFields = fields.filter(
    (field) => field.kind === 'select' && field.options.length > 0
  );

  function toggleChoice(fieldId: string, optionId: string) {
    const current = filter.choices?.[fieldId] ?? [];
    onChange({
      ...filter,
      choices: {
        ...filter.choices,
        [fieldId]: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      },
    });
  }

  return (
    <div className="filter-bar">
      {leading}
      {leading && <span className="filter-bar__divider" aria-hidden="true" />}
      <div className="filter-bar__group" role="group" aria-label="Filter cards">
        <span className="filter-bar__title">Filter</span>
        <div className="filter-bar__pills">
          <Pill pressed={filter.mine} onToggle={() => onChange({ ...filter, mine: !filter.mine })}>
            My cards
          </Pill>
          <Pill
            pressed={filter.overdue}
            onToggle={() => onChange({ ...filter, overdue: !filter.overdue })}
          >
            Overdue
          </Pill>
        </div>
        {labels.length > 0 && (
          <>
            <span className="filter-bar__divider" aria-hidden="true" />
            <ul className="filter-bar__list" aria-labelledby={labelsHeading}>
              <li id={labelsHeading} className="sr-only">
                Labels
              </li>
              {labels.map((label) => (
                <li key={label.id}>
                  <button
                    type="button"
                    className="filter-bar__toggle"
                    aria-pressed={filter.labelIds.includes(label.id)}
                    onClick={() => toggleLabel(label.id)}
                  >
                    <LabelChip name={label.name} color={label.color} priority={label.priority} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {selectFields.map((field) => (
          <div key={field.id} className="filter-bar__field">
            <span className="filter-bar__field-name">{field.name}</span>
            <ul className="filter-bar__list" aria-label={`Filter by ${field.name}`}>
              {field.options.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="filter-bar__toggle"
                    aria-pressed={(filter.choices?.[field.id] ?? []).includes(option.id)}
                    onClick={() => toggleChoice(field.id, option.id)}
                  >
                    <LabelChip name={option.name} color={option.color} priority="none" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {isFiltering(filter) && (
          <div className="filter-bar__summary">
            <span role="status" aria-live="polite">
              {matchCount} of {totalCount} cards match
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => onChange(EMPTY_FILTER)}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

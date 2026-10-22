import { type KeyboardEvent, type ReactNode, useRef } from 'react';

import './Segmented.css';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  /** Shows the option in its own typeface, for choosing a font. */
  fontFamily?: string;
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
}

/**
 * A small radio group drawn as one pill with a sliding thumb. Arrow keys move
 * the selection, Home and End jump to the ends, and only the selected option
 * is in the tab order, as for a native radio group.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value)
  );

  function move(to: number) {
    const target = (to + options.length) % options.length;
    onChange(options[target].value);
    refs.current[target]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        move(index + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        move(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        move(0);
        break;
      case 'End':
        event.preventDefault();
        move(options.length - 1);
        break;
      default:
        break;
    }
  }

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      style={
        { '--segmented-count': options.length, '--segmented-index': index } as React.CSSProperties
      }
    >
      <span className="segmented__thumb" aria-hidden="true" />
      {options.map((option, position) => (
        <button
          key={option.value}
          ref={(node) => {
            refs.current[position] = node;
          }}
          type="button"
          role="radio"
          className="segmented__option"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={handleKeyDown}
          style={option.fontFamily ? { fontFamily: option.fontFamily } : undefined}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

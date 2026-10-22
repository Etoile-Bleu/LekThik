import { type KeyboardEvent, useRef } from 'react';

import { CheckIcon } from '../ui/Icons';
import './Swatches.css';

export interface SwatchOption<T extends string> {
  key: T;
  label: string;
  /** `null` draws the neutral "none" swatch. */
  color: string | null;
}

interface SwatchesProps<T extends string> {
  label: string;
  value: T;
  options: SwatchOption<T>[];
  disabled?: boolean;
  onChange: (key: T) => void;
}

/** A row of colour choices as a radio group, with a check so the choice is not only a colour. */
export function Swatches<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: SwatchesProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.key === value)
  );

  function move(to: number) {
    const target = (to + options.length) % options.length;
    onChange(options[target].key);
    refs.current[target]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const steps: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    if (event.key in steps) {
      event.preventDefault();
      move(index + steps[event.key]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      move(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      move(options.length - 1);
    }
  }

  return (
    <div className="look-swatches" role="radiogroup" aria-label={label}>
      {options.map((option, position) => (
        <button
          key={option.key}
          ref={(node) => {
            refs.current[position] = node;
          }}
          type="button"
          role="radio"
          className="look-swatch"
          aria-checked={option.key === value}
          aria-label={option.label}
          title={option.label}
          disabled={disabled}
          tabIndex={option.key === value ? 0 : -1}
          style={option.color ? ({ '--swatch': option.color } as React.CSSProperties) : undefined}
          data-none={option.color === null || undefined}
          onClick={() => onChange(option.key)}
          onKeyDown={handleKeyDown}
        >
          <span className="look-swatch__check" aria-hidden="true">
            <CheckIcon size={14} />
          </span>
        </button>
      ))}
    </div>
  );
}

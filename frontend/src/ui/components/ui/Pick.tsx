import type { ReactNode } from 'react';

import { CheckIcon } from './Icons';
import './Pick.css';

interface PickProps {
  checked: boolean;
  disabled?: boolean;
  /** Drops the outer outline, for content that already draws its own (a label chip). */
  bare?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}

/**
 * A chip you can switch on and off: a real checkbox underneath, so it keeps
 * its role, its keyboard behaviour and its name, with a face that shows the
 * state with a check mark and not only with colour.
 */
export function Pick({ checked, disabled = false, bare = false, onChange, children }: PickProps) {
  return (
    <label
      className="pick"
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
      data-bare={bare || undefined}
    >
      <input
        type="checkbox"
        className="pick__input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="pick__face">
        <span className="pick__check" aria-hidden="true">
          <CheckIcon size={12} />
        </span>
        {children}
      </span>
    </label>
  );
}

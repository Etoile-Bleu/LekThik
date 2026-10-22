import { type ReactNode, useId } from 'react';

import './SettingRow.css';

interface SettingRowProps {
  label: string;
  hint?: string;
  /** Puts the control under the text, for wide controls such as the theme tiles. */
  stacked?: boolean;
  children: ReactNode;
}

/**
 * One setting: its name and a line of explanation on the left, the control on
 * the right. Every row of a page shares the same two columns, so labels line
 * up and the eye can run down the controls.
 */
export function SettingRow({ label, hint, stacked = false, children }: SettingRowProps) {
  const labelId = useId();

  return (
    <div
      className="setting-row"
      data-stacked={stacked || undefined}
      role="group"
      aria-labelledby={labelId}
    >
      <div className="setting-row__text">
        <span className="setting-row__label" id={labelId}>
          {label}
        </span>
        {hint && <p className="setting-row__hint">{hint}</p>}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

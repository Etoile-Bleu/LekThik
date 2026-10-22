import { type ReactNode, useId } from 'react';

import './PropertyRow.css';

interface PropertyRowProps {
  icon: ReactNode;
  label: string;
  /** Position in the list, used to stagger the entrance. */
  index?: number;
  children: ReactNode;
}

/**
 * One `name | value` line. Every row of a list shares the same label column,
 * so values line up and the eye can scan down them, the way Notion and Linear
 * lay out the properties of a page.
 */
export function PropertyRow({ icon, label, index = 0, children }: PropertyRowProps) {
  const labelId = useId();

  return (
    <div
      className="prop"
      role="group"
      aria-labelledby={labelId}
      style={{ '--prop-index': index } as React.CSSProperties}
    >
      <div className="prop__label" id={labelId}>
        <span className="prop__icon" aria-hidden="true">
          {icon}
        </span>
        {label}
      </div>
      <div className="prop__value">{children}</div>
    </div>
  );
}

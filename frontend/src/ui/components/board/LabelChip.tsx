import { PRIORITY_LABELS } from '@lib/boardModel';
import type { LabelColor, Priority } from '@lib/boardsApi';

import './LabelChip.css';

const PRIORITY_LEVEL: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

export function PriorityBars({ priority }: { priority: Priority }) {
  const level = PRIORITY_LEVEL[priority];

  return (
    <svg
      className="priority-bars"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
    >
      {[0, 1, 2, 3].map((index) => (
        <rect
          key={index}
          x={index * 3}
          y={9 - index * 3}
          width="2"
          height={3 + index * 3}
          rx="0.6"
          fill="currentColor"
          opacity={index < level ? 1 : 0.28}
        />
      ))}
    </svg>
  );
}

interface LabelChipProps {
  name: string;
  color: LabelColor;
  priority: Priority;
  showPriorityText?: boolean;
}

export function LabelChip({ name, color, priority, showPriorityText = true }: LabelChipProps) {
  return (
    <span className={`label-chip label-chip--${color}`}>
      {priority !== 'none' && <PriorityBars priority={priority} />}
      <span className="label-chip__name">{name}</span>
      {showPriorityText && priority !== 'none' && (
        <span className="sr-only">, {PRIORITY_LABELS[priority].toLowerCase()}</span>
      )}
    </span>
  );
}

import { useMemo } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { useCountUp } from '@hooks/useCountUp';
import { counterConfig, readCounter } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';

import { AlertIcon, CheckCircleIcon, ClockIcon } from '../../ui/Icons';
import './CounterBlock.css';

interface CounterBlockProps {
  block: BoardList;
  panels: BoardList[];
}

const TONE_ICON = {
  good: CheckCircleIcon,
  late: AlertIcon,
  warn: ClockIcon,
} as const;

/**
 * One number, large, with what it counts under it. The state is said by an
 * icon and words as well as the colour, and the whole reading is one sentence
 * for a screen reader.
 */
export function CounterBlock({ block, panels }: CounterBlockProps) {
  const { today } = useBoardMeta();
  const config = counterConfig(block);
  const reading = useMemo(
    () => readCounter(config, panels, today),
    [config.metric, config.label, config.done_list_id, config.date, panels, today] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const numeric = /^\d+%?$/.test(reading.value) ? Number.parseInt(reading.value, 10) : null;
  const counted = useCountUp(numeric);
  const visible =
    numeric === null || counted === null
      ? reading.value
      : `${counted}${reading.value.endsWith('%') ? '%' : ''}`;
  const Icon = reading.tone === 'calm' ? null : TONE_ICON[reading.tone];

  return (
    <div className="counter-block" data-tone={reading.tone}>
      <p className="sr-only">{reading.spoken}</p>
      <div className="counter-block__figure" aria-hidden="true">
        {Icon && <Icon size={22} />}
        <span className="counter-block__value">{visible}</span>
      </div>
      <p className="counter-block__caption" aria-hidden="true">
        {reading.caption}
      </p>
      {reading.percent !== null && (
        <div className="counter-block__bar" aria-hidden="true">
          <span style={{ width: `${reading.percent}%` }} />
        </div>
      )}
      {reading.detail && (
        <p className="counter-block__detail" aria-hidden="true">
          {reading.detail}
        </p>
      )}
    </div>
  );
}

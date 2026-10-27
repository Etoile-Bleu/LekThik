import { useEffect, useState } from 'react';

import { useCountUp } from '@hooks/useCountUp';
import { progressConfig, readProgress } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';

import { CheckCircleIcon } from '../../ui/Icons';
import './ProgressBlock.css';

interface ProgressBlockProps {
  block: BoardList;
  panels: BoardList[];
}

const RING_RADIUS = 46;

function useDrawn(): boolean {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return drawn;
}

export function ProgressBlock({ block, panels }: ProgressBlockProps) {
  const config = progressConfig(block);
  const reading = readProgress(config, panels);
  const drawn = useDrawn();
  const shown = useCountUp(
    reading.state === 'running' || reading.state === 'complete' ? reading.percent : null
  );
  const percent = drawn ? reading.percent : 0;
  const measuring = reading.state === 'running' || reading.state === 'complete';

  return (
    <div className="progress-block" data-style={config.style} data-state={reading.state}>
      <div
        className="progress-block__figure"
        role="progressbar"
        aria-label={reading.caption}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={measuring ? reading.percent : undefined}
        aria-valuetext={reading.spoken}
      >
        {config.style === 'ring' ? (
          <svg
            viewBox="0 0 120 120"
            className="progress-block__ring"
            aria-hidden="true"
            focusable="false"
          >
            <circle
              className="progress-block__track"
              cx="60"
              cy="60"
              r={RING_RADIUS}
              pathLength={100}
            />
            <circle
              className="progress-block__fill"
              cx="60"
              cy="60"
              r={RING_RADIUS}
              pathLength={100}
              style={{ strokeDashoffset: 100 - percent }}
            />
          </svg>
        ) : (
          <div className="progress-block__bar" aria-hidden="true">
            <span style={{ transform: `scaleX(${percent / 100})` }} />
          </div>
        )}
        <div className="progress-block__value" aria-hidden="true">
          {reading.state === 'complete' && <CheckCircleIcon size={20} />}
          <span>{measuring ? `${shown ?? reading.percent}%` : '–'}</span>
        </div>
      </div>
      <p className="progress-block__caption" aria-hidden="true">
        {reading.caption}
      </p>
      <p className="progress-block__detail" aria-hidden="true">
        {reading.detail}
      </p>
    </div>
  );
}

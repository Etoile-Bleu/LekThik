import { useMemo, useState } from 'react';

import { useBoardMeta } from '@hooks/useBoardMeta';
import { chartConfig } from '@lib/blocks';
import type { BoardList } from '@lib/boardsApi';
import { type ChartReading, type ChartRow, readChart } from '@lib/chart';

import './ChartBlock.css';

interface ChartBlockProps {
  block: BoardList;
  panels: BoardList[];
}

const DONUT_RADIUS = 38;
const SEGMENT_GAP = 0.8;

function percentOf(count: number, sum: number): number {
  return sum === 0 ? 0 : Math.round((count / sum) * 100);
}

function Bars({ rows, max }: { rows: ChartRow[]; max: number }) {
  return (
    <ul className="chart-block__bars" aria-hidden="true">
      {rows.map((row, index) => (
        <li key={row.key} style={{ '--row-index': index } as React.CSSProperties}>
          <span className="chart-block__name" title={row.name}>
            {row.name}
          </span>
          <span className="chart-block__track">
            <span
              className="chart-block__fill"
              style={{ '--share': max === 0 ? 0 : row.count / max } as React.CSSProperties}
            />
          </span>
          <span className="chart-block__value">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Donut({ reading }: { reading: ChartReading }) {
  let start = 0;
  return (
    <div className="chart-block__donut" aria-hidden="true">
      <svg viewBox="0 0 100 100" focusable="false">
        <circle className="chart-block__ring" cx="50" cy="50" r={DONUT_RADIUS} pathLength={100} />
        {reading.rows.map((row, index) => {
          const length = reading.sum === 0 ? 0 : (row.count / reading.sum) * 100;
          const drawn = Math.max(0, length - (reading.rows.length > 1 ? SEGMENT_GAP : 0));
          const offset = -start;
          start += length;
          return (
            <circle
              key={row.key}
              className="chart-block__segment"
              cx="50"
              cy="50"
              r={DONUT_RADIUS}
              pathLength={100}
              style={
                {
                  stroke: row.color,
                  strokeDasharray: `${drawn} ${100 - drawn}`,
                  strokeDashoffset: offset,
                  '--row-index': index,
                } as React.CSSProperties
              }
            />
          );
        })}
      </svg>
      <p className="chart-block__centre">
        <span className="chart-block__total">{reading.cards}</span>
        <span className="chart-block__unit">{reading.cards === 1 ? 'card' : 'cards'}</span>
      </p>
      <ul className="chart-block__legend">
        {reading.rows.map((row) => (
          <li key={row.key}>
            <span className="chart-block__swatch" style={{ background: row.color }} />
            <span className="chart-block__name" title={row.name}>
              {row.name}
            </span>
            <span className="chart-block__value">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartBlock({ block, panels }: ChartBlockProps) {
  const { today, membersById, labels } = useBoardMeta();
  const config = chartConfig(block);
  const reading = useMemo(
    () => readChart(config, panels, labels, membersById, today),
    [config.source, config.style, panels, labels, membersById, today] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [asTable, setAsTable] = useState(false);

  if (reading.empty) {
    return (
      <div className="chart-block chart-block--empty">
        <p className="chart-block__empty-title">Nothing to chart yet</p>
        <p>Add a few cards and they are counted here.</p>
      </div>
    );
  }

  return (
    <div className="chart-block" data-style={config.style}>
      <div className="chart-block__head">
        <h3 className="chart-block__title">{reading.title}</h3>
        <button
          type="button"
          className="chart-block__toggle"
          aria-pressed={asTable}
          onClick={() => setAsTable((on) => !on)}
        >
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <p className="sr-only" role="status">
        {reading.spoken}
      </p>
      {!asTable &&
        (config.style === 'donut' ? (
          <Donut reading={reading} />
        ) : (
          <Bars rows={reading.rows} max={reading.max} />
        ))}
      <table className={asTable ? 'chart-block__table' : 'chart-block__table sr-only'}>
        <caption className="sr-only">{reading.title}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Cards</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {reading.rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.name}</th>
              <td>{row.count}</td>
              <td>{percentOf(row.count, reading.sum)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

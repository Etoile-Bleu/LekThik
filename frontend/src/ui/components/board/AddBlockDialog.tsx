import { BLOCK_KINDS } from '@lib/blocks';
import type { PanelKind } from '@lib/boardsApi';

import { Dialog } from '../ui/Dialog';
import { KindIcon } from './BoardBlock';
import './AddBlockDialog.css';

interface AddBlockDialogProps {
  open: boolean;
  onPick: (kind: Exclude<PanelKind, 'list'>) => void;
  onClose: () => void;
}

/** A tiny drawing of what each block looks like, so the choice is made by looking. */
function Preview({ kind }: { kind: Exclude<PanelKind, 'list'> }) {
  switch (kind) {
    case 'image':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <rect x="10" y="8" width="76" height="48" rx="5" className="add-block__faint" />
          <circle cx="30" cy="24" r="6" className="add-block__accent" />
          <path d="M10 50 34 32l16 12 14-10 22 18v4H10Z" className="add-block__ink" />
        </svg>
      );
    case 'embed':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <rect x="10" y="8" width="76" height="44" rx="5" className="add-block__faint" />
          <circle cx="48" cy="30" r="12" className="add-block__ink" />
          <path d="M44 24l10 6-10 6V24Z" className="add-block__accent" />
          <rect x="10" y="57" width="44" height="3" rx="1.5" className="add-block__faint" />
        </svg>
      );
    case 'link':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <rect x="8" y="14" width="80" height="36" rx="5" className="add-block__faint" />
          <rect x="16" y="22" width="20" height="20" rx="4" className="add-block__ink" />
          <rect x="44" y="23" width="36" height="5" rx="2.5" className="add-block__ink" />
          <rect x="44" y="32" width="22" height="4" rx="2" className="add-block__accent" />
          <rect x="44" y="39" width="30" height="3" rx="1.5" className="add-block__faint" />
        </svg>
      );
    case 'calendar':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          {Array.from({ length: 28 }, (_, index) => {
            const column = index % 7;
            const row = Math.floor(index / 7);
            const marked = index === 9 || index === 16 || index === 22;
            return (
              <rect
                key={index}
                x={6 + column * 12}
                y={8 + row * 13}
                width="9"
                height="9"
                rx="2.5"
                className={
                  marked
                    ? 'add-block__ink'
                    : index === 11
                      ? 'add-block__accent'
                      : 'add-block__faint'
                }
              />
            );
          })}
        </svg>
      );
    case 'agenda':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          {[0, 1, 2].map((row) => (
            <g key={row} transform={`translate(8 ${8 + row * 18})`}>
              <rect
                width="3"
                height="13"
                rx="1.5"
                className={row === 0 ? 'add-block__late' : 'add-block__accent'}
              />
              <rect
                x="9"
                y="1"
                width={row === 1 ? 52 : 66}
                height="4"
                rx="2"
                className="add-block__ink"
              />
              <rect x="9" y="8" width="30" height="3" rx="1.5" className="add-block__faint" />
            </g>
          ))}
        </svg>
      );
    case 'note':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <rect x="12" y="8" width="72" height="4" rx="2" className="add-block__ink" />
          <rect x="12" y="19" width="62" height="4" rx="2" className="add-block__faint" />
          <rect x="12" y="29" width="68" height="4" rx="2" className="add-block__faint" />
          <rect x="12" y="39" width="40" height="4" rx="2" className="add-block__faint" />
          <rect x="12" y="50" width="26" height="4" rx="2" className="add-block__accent" />
        </svg>
      );
    case 'table':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <rect x="10" y="10" width="76" height="44" rx="3" className="add-block__code-bg" />
          <rect x="10" y="10" width="76" height="11" rx="3" className="add-block__faint" />
          {[35, 60].map((x) => (
            <rect key={x} x={x} y="10" width="1" height="44" className="add-block__rule" />
          ))}
          {[32, 43].map((y) => (
            <rect key={y} x="10" y={y} width="76" height="1" className="add-block__rule" />
          ))}
          <rect x="14" y="14" width="14" height="3" rx="1.5" className="add-block__ink" />
          <rect x="39" y="14" width="14" height="3" rx="1.5" className="add-block__ink" />
          <rect x="64" y="14" width="14" height="3" rx="1.5" className="add-block__ink" />
          <rect x="66" y="25" width="12" height="3" rx="1.5" className="add-block__accent" />
        </svg>
      );
    case 'snippet':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <rect x="8" y="8" width="80" height="48" rx="4" className="add-block__code-bg" />
          {[
            [14, 40, 'add-block__accent'],
            [26, 26, 'add-block__ink'],
            [26, 34, 'add-block__faint'],
            [14, 18, 'add-block__accent'],
          ].map(([x, width, tone], row) => (
            <rect
              key={row}
              x={Number(x) + 4}
              y={16 + row * 9}
              width={Number(width)}
              height="4"
              rx="2"
              className={String(tone)}
            />
          ))}
        </svg>
      );
    case 'chart':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          {[62, 44, 30, 18].map((width, row) => (
            <g key={row} transform={`translate(10 ${9 + row * 13})`}>
              <rect width="14" height="3" rx="1.5" className="add-block__faint" />
              <rect x="19" width={width} height="8" rx="2" className="add-block__accent" />
            </g>
          ))}
        </svg>
      );
    case 'overdue':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          {[0, 1, 2].map((row) => (
            <g key={row} transform={`translate(8 ${8 + row * 18})`}>
              <rect width={7 - row * 2} height="13" rx="1.5" className="add-block__late" />
              <rect
                x="12"
                y="1"
                width={66 - row * 12}
                height="4"
                rx="2"
                className="add-block__ink"
              />
              <rect x="12" y="8" width="26" height="3" rx="1.5" className="add-block__faint" />
            </g>
          ))}
        </svg>
      );
    case 'progress':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <circle
            cx="48"
            cy="32"
            r="21"
            fill="none"
            strokeWidth="8"
            className="add-block__ring-track"
          />
          <circle
            cx="48"
            cy="32"
            r="21"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            pathLength="100"
            strokeDasharray="68 100"
            transform="rotate(-90 48 32)"
            className="add-block__ring-fill"
          />
        </svg>
      );
    case 'counter':
      return (
        <svg viewBox="0 0 96 64" aria-hidden="true" focusable="false">
          <text x="12" y="38" className="add-block__digits">
            68%
          </text>
          <rect x="12" y="46" width="72" height="6" rx="3" className="add-block__faint" />
          <rect x="12" y="46" width="49" height="6" rx="3" className="add-block__accent" />
        </svg>
      );
  }
}

export function AddBlockDialog({ open, onPick, onClose }: AddBlockDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a block" size="md">
      <div className="add-block">
        <h2 className="add-block__title">Add a block</h2>
        <p className="add-block__lead">
          Blocks sit in the row with your lists and draw on the cards of this board. You can change
          them any time.
        </p>
        <ul className="add-block__grid">
          {BLOCK_KINDS.map((info, index) => (
            <li key={info.kind} style={{ '--option-index': index } as React.CSSProperties}>
              <button
                type="button"
                className="add-block__option"
                onClick={() => {
                  onPick(info.kind);
                  onClose();
                }}
              >
                <span className="add-block__preview">
                  <Preview kind={info.kind} />
                </span>
                <span className="add-block__name">
                  <KindIcon kind={info.kind} size={15} />
                  {info.label}
                </span>
                <span className="add-block__description">{info.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

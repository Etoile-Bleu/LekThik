import { type CSSProperties, type FormEvent, useEffect, useId, useState } from 'react';

import type { PanelKind } from '@lib/boardsApi';
import {
  GRID_COLUMNS,
  GRID_MAX_ROWS,
  GRID_MAX_TILE_HEIGHT,
  type Rect,
  clampRect,
  describeRect,
  minSize,
} from '@lib/grid';

import { Dialog } from '../ui/Dialog';
import './TilePositionDialog.css';

interface TilePositionDialogProps {
  open: boolean;
  name: string;
  kind: PanelKind;
  rect: Rect | null;
  onSave: (rect: Rect) => void;
  onClose: () => void;
}

interface Fields {
  column: string;
  row: string;
  width: string;
  height: string;
}

function toFields(rect: Rect): Fields {
  return {
    column: String(rect.x + 1),
    row: String(rect.y + 1),
    width: String(rect.w),
    height: String(rect.h),
  };
}

function fromFields(fields: Fields, kind: PanelKind): Rect | null {
  const numbers = [fields.column, fields.row, fields.width, fields.height].map((text) =>
    /^\d+$/.test(text.trim()) ? Number(text) : Number.NaN
  );
  if (numbers.some((value) => !Number.isFinite(value))) return null;
  const [column, row, width, height] = numbers;
  return clampRect(kind, { x: column - 1, y: row - 1, w: width, h: height });
}

/**
 * The same thing the pointer and the arrow keys do, with numbers: where a tile sits and how
 * big it is. For anyone who cannot or would rather not drag.
 */
export function TilePositionDialog({
  open,
  name,
  kind,
  rect,
  onSave,
  onClose,
}: TilePositionDialogProps) {
  const [fields, setFields] = useState<Fields>({ column: '1', row: '1', width: '3', height: '6' });
  const ids = { column: useId(), row: useId(), width: useId(), height: useId() };
  const hintId = useId();
  const min = minSize(kind);

  useEffect(() => {
    if (open && rect) setFields(toFields(rect));
  }, [open, rect]);

  const next = fromFields(fields, kind);
  const preview = next ?? rect;
  const rows = Math.max(8, (preview?.y ?? 0) + (preview?.h ?? 0) + 1);

  function change(key: keyof Fields, value: string) {
    setFields((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!next) return;
    onSave(next);
    onClose();
  }

  const items: Array<{ key: keyof Fields; label: string; low: number; high: number }> = [
    { key: 'column', label: 'Column', low: 1, high: GRID_COLUMNS },
    { key: 'row', label: 'Row', low: 1, high: GRID_MAX_ROWS },
    { key: 'width', label: 'Width', low: min.w, high: GRID_COLUMNS },
    { key: 'height', label: 'Height', low: min.h, high: GRID_MAX_TILE_HEIGHT },
  ];

  return (
    <Dialog open={open} onClose={onClose} title={`Position and size of ${name}`} size="sm">
      <form className="tile-dialog" onSubmit={handleSubmit} noValidate>
        <h2 className="tile-dialog__title">Position and size</h2>
        <p className="tile-dialog__lead">
          Where <strong>{name}</strong> sits on the 12 column grid and how big it is. Other tiles
          make room.
        </p>

        <div className="tile-dialog__fields">
          {items.map((item) => (
            <div className="field" key={item.key}>
              <label htmlFor={ids[item.key]}>{item.label}</label>
              <input
                id={ids[item.key]}
                type="number"
                inputMode="numeric"
                min={item.low}
                max={item.high}
                step={1}
                value={fields[item.key]}
                aria-describedby={hintId}
                autoFocus={item.key === 'column'}
                onChange={(event) => change(item.key, event.target.value)}
              />
            </div>
          ))}
        </div>

        <p id={hintId} className="tile-dialog__hint">
          Columns go from 1 to 12 and a tile stays inside them. This one is at least {min.w} wide
          and {min.h} tall. Numbers outside that are brought back to the nearest place that works.
        </p>

        {preview && (
          <div
            className="tile-dialog__map"
            role="img"
            aria-label={`Preview: ${describeRect(preview)}`}
            style={{ '--rows': rows } as CSSProperties}
          >
            <span
              className="tile-dialog__tile"
              style={
                {
                  '--x': preview.x,
                  '--y': preview.y,
                  '--w': preview.w,
                  '--h': preview.h,
                } as CSSProperties
              }
            />
          </div>
        )}

        <div className="tile-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={!next}>
            Place
          </button>
        </div>
      </form>
    </Dialog>
  );
}

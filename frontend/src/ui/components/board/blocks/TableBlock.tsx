import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { announce } from '@lib/announcer';
import { tableConfig } from '@lib/blocks';
import type { BoardList, TableConfig } from '@lib/boardsApi';
import {
  TABLE_MAX_COLUMNS,
  TABLE_MAX_ROWS,
  columnTotal,
  formatTotal,
  parseDelimited,
  parseNumber,
  toCsv,
} from '@lib/csv';
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  pasteGrid,
  removeColumn,
  removeRow,
  setCell,
} from '@lib/tableOps';

import { PlusIcon, TrashIcon } from '../../ui/Icons';
import './TableBlock.css';

interface TableBlockProps {
  block: BoardList;
  editable: boolean;
  onSave: (blockId: string, config: TableConfig) => void;
}

interface Position {
  row: number;
  column: number;
}

const PAGE = 5;
const SAVED_MS = 700;

function clamp(value: number, high: number): number {
  return Math.min(Math.max(value, 0), Math.max(high, 0));
}

function columnName(index: number): string {
  return String.fromCharCode(65 + index);
}

function downloadCsv(name: string, rows: string[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^\p{L}\p{N}_-]+/gu, '-') || 'table'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function TableBlock({ block, editable, onSave }: TableBlockProps) {
  const config = tableConfig(block);
  const { rows, header } = config;
  const [active, setActive] = useState<Position>({ row: 0, column: 0 });
  const [editing, setEditing] = useState<Position | null>(null);
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const cells = useRef(new Map<string, HTMLElement>());
  const wantFocus = useRef(false);
  const savedTimer = useRef<number>();

  const height = rows.length;
  const width = rows.reduce((most, row) => Math.max(most, row.length), 0);
  const here = { row: clamp(active.row, height - 1), column: clamp(active.column, width - 1) };

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    cells.current.get(`${here.row}:${here.column}`)?.focus();
  });

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  function save(next: string[][], key?: string) {
    onSave(block.id, { ...config, rows: next });
    if (key) {
      setSaved(key);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(null), SAVED_MS);
    }
  }

  function moveTo(row: number, column: number) {
    wantFocus.current = true;
    setActive({ row: clamp(row, height - 1), column: clamp(column, width - 1) });
  }

  function startEditing(position: Position, text: string) {
    if (!editable) return;
    setActive(position);
    setDraft(text);
    setEditing(position);
  }

  function stopEditing(commit: boolean) {
    if (!editing) return;
    const { row, column } = editing;
    if (commit && draft !== (rows[row]?.[column] ?? '')) {
      save(setCell(rows, row, column, draft), `${row}:${column}`);
    }
    setEditing(null);
    wantFocus.current = true;
  }

  function onCellKeyDown(event: KeyboardEvent<HTMLElement>) {
    const row = Number(event.currentTarget.dataset.row);
    const column = Number(event.currentTarget.dataset.column);
    const here = { row, column };
    const withControl = event.ctrlKey || event.metaKey;
    switch (event.key) {
      case 'ArrowDown':
        return move(event, row + 1, column);
      case 'ArrowUp':
        return move(event, row - 1, column);
      case 'ArrowRight':
        return move(event, row, column + 1);
      case 'ArrowLeft':
        return move(event, row, column - 1);
      case 'PageDown':
        return move(event, row + PAGE, column);
      case 'PageUp':
        return move(event, row - PAGE, column);
      case 'Home':
        return move(event, withControl ? 0 : row, 0);
      case 'End':
        return move(event, withControl ? height - 1 : row, width - 1);
      case 'Enter':
      case 'F2':
        event.preventDefault();
        return startEditing(here, rows[row]?.[column] ?? '');
      case 'Delete':
      case 'Backspace':
        if (!editable) return undefined;
        event.preventDefault();
        if ((rows[row]?.[column] ?? '') !== '')
          save(setCell(rows, row, column, ''), `${row}:${column}`);
        return undefined;
      default:
        if (editable && event.key.length === 1 && !withControl && !event.altKey) {
          event.preventDefault();
          startEditing(here, event.key);
        }
        return undefined;
    }
  }

  function move(event: KeyboardEvent<HTMLElement>, row: number, column: number) {
    event.preventDefault();
    moveTo(row, column);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!editing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      const { row, column } = editing;
      stopEditing(true);
      moveTo(row + 1, column);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const { row, column } = editing;
      stopEditing(true);
      moveTo(row, column + (event.shiftKey ? -1 : 1));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      stopEditing(false);
    }
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    if (!editable || editing) return;
    const text = event.clipboardData.getData('text/plain');
    if (text === '') return;
    event.preventDefault();
    const { rows: next, trimmed } = pasteGrid(rows, here.row, here.column, parseDelimited(text));
    save(next, `${here.row}:${here.column}`);
    announce(trimmed ? 'Pasted. Some of it did not fit and was cut.' : 'Pasted.');
  }

  function insertRow() {
    if (!canAddRow(rows)) {
      announce(`A table holds at most ${TABLE_MAX_ROWS} rows.`);
      return;
    }
    save(addRow(rows, here.row));
    moveTo(here.row + 1, here.column);
    announce('Row added.');
  }

  function insertColumn() {
    if (!canAddColumn(rows)) {
      announce(`A table holds at most ${TABLE_MAX_COLUMNS} columns.`);
      return;
    }
    save(addColumn(rows, here.column));
    moveTo(here.row, here.column + 1);
    announce('Column added.');
  }

  function dropRow() {
    save(removeRow(rows, here.row));
    moveTo(here.row, here.column);
    announce('Row deleted.');
  }

  function dropColumn() {
    save(removeColumn(rows, here.column));
    moveTo(here.row, here.column);
    announce('Column deleted.');
  }

  if (height === 0 || width === 0) {
    return (
      <div className="table-block table-block--empty">
        <p className="table-block__title">An empty table</p>
        {editable ? (
          <button type="button" className="btn btn--outline btn--sm" onClick={() => save([['']])}>
            <PlusIcon size={15} /> Add a cell
          </button>
        ) : (
          <p>Nothing has been written here yet.</p>
        )}
      </div>
    );
  }

  const bodyStart = header ? 1 : 0;
  const totals = Array.from({ length: width }, (_, column) => columnTotal(rows, column, header));
  const showTotals = totals.some((total) => total !== null) && height - bodyStart >= 2;

  function cell(row: number, column: number) {
    const text = rows[row]?.[column] ?? '';
    const isHeader = header && row === 0;
    const isActive = here.row === row && here.column === column;
    const isEditing = editing?.row === row && editing.column === column;
    const numeric = !isHeader && parseNumber(text) !== null;
    const props = {
      role: isHeader ? 'columnheader' : 'gridcell',
      tabIndex: isActive ? 0 : -1,
      'data-row': row,
      'data-column': column,
      'data-active': isActive || undefined,
      'data-numeric': numeric || undefined,
      'data-saved': saved === `${row}:${column}` || undefined,
      'aria-readonly': editable ? undefined : true,
      onKeyDown: isEditing ? undefined : onCellKeyDown,
      onFocus: () => setActive({ row, column }),
      onDoubleClick: () => startEditing({ row, column }, text),
      ref: (node: HTMLElement | null) => {
        const id = `${row}:${column}`;
        if (node) cells.current.set(id, node);
        else cells.current.delete(id);
      },
    };
    const content = isEditing ? (
      <input
        className="table-block__input"
        value={draft}
        maxLength={200}
        aria-label={`${isHeader ? 'Heading' : 'Cell'} ${columnName(column)}${row + 1}`}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onInputKeyDown}
        onBlur={() => stopEditing(true)}
      />
    ) : (
      text
    );
    return isHeader ? (
      <th key={column} {...props} scope="col">
        {content}
      </th>
    ) : (
      <td key={column} {...props}>
        {content}
      </td>
    );
  }

  return (
    <div className="table-block">
      {editable && (
        <div className="table-block__tools" role="toolbar" aria-label="Table tools">
          <button type="button" onClick={insertRow} disabled={!canAddRow(rows)}>
            <PlusIcon size={13} /> Row
          </button>
          <button type="button" onClick={insertColumn} disabled={!canAddColumn(rows)}>
            <PlusIcon size={13} /> Column
          </button>
          <button type="button" onClick={dropRow} disabled={height <= 1}>
            <TrashIcon size={13} /> Row
            <span className="sr-only"> at the selected cell</span>
          </button>
          <button type="button" onClick={dropColumn}>
            <TrashIcon size={13} /> Column
            <span className="sr-only"> at the selected cell</span>
          </button>
          <button type="button" onClick={() => downloadCsv(block.name, rows)}>
            Export CSV
          </button>
        </div>
      )}
      <div className="table-block__scroll">
        <table
          className="table-block__grid"
          role="grid"
          aria-label={block.name}
          aria-rowcount={height}
          aria-colcount={width}
          onPaste={onPaste}
        >
          {header && (
            <thead>
              <tr>{rows[0].map((_, column) => cell(0, column))}</tr>
            </thead>
          )}
          <tbody>
            {rows.slice(bodyStart).map((_, offset) => {
              const row = bodyStart + offset;
              return <tr key={row}>{rows[row].map((__, column) => cell(row, column))}</tr>;
            })}
          </tbody>
          {showTotals && (
            <tfoot>
              <tr>
                {totals.map((total, column) => (
                  <td key={column} data-numeric={total !== null || undefined}>
                    {column === 0 && total === null ? (
                      <span className="table-block__total-label">Total</span>
                    ) : total === null ? null : (
                      <>
                        <span className="sr-only">Total: </span>
                        {formatTotal(total)}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {editable && (
        <p className="table-block__hint">
          Arrows move, Enter edits, Delete clears. Paste cells from a spreadsheet or a CSV file.
        </p>
      )}
    </div>
  );
}

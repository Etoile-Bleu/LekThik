import { describe, expect, it } from 'vitest';

import { TABLE_MAX_COLUMNS, TABLE_MAX_ROWS } from './csv';
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  pasteGrid,
  removeColumn,
  removeRow,
  setCell,
} from './tableOps';

const grid = [
  ['a', 'b'],
  ['c', 'd'],
];

describe('editing', () => {
  it('sets one cell without touching the original', () => {
    const next = setCell(grid, 1, 0, 'x');

    expect(next).toEqual([
      ['a', 'b'],
      ['x', 'd'],
    ]);
    expect(grid[1][0]).toBe('c');
  });

  it('adds a blank row and a blank column after the chosen one', () => {
    expect(addRow(grid, 0)).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd'],
    ]);
    expect(addColumn(grid, 0)).toEqual([
      ['a', '', 'b'],
      ['c', '', 'd'],
    ]);
  });

  it('starts again from nothing', () => {
    expect(addRow([], -1)).toEqual([['']]);
    expect(addColumn([], -1)).toEqual([['']]);
  });

  it('refuses to grow past the limits', () => {
    const tall = Array.from({ length: TABLE_MAX_ROWS }, () => ['a']);
    const wide = [Array.from({ length: TABLE_MAX_COLUMNS }, () => 'a')];

    expect(canAddRow(tall)).toBe(false);
    expect(addRow(tall, 0)).toBe(tall);
    expect(canAddColumn(wide)).toBe(false);
    expect(addColumn(wide, 0)).toBe(wide);
    expect(canAddRow(grid)).toBe(true);
  });

  it('removes a row or a column, and empties the table with its last column', () => {
    expect(removeRow(grid, 0)).toEqual([['c', 'd']]);
    expect(removeColumn(grid, 1)).toEqual([['a'], ['c']]);
    expect(removeColumn([['a']], 0)).toEqual([]);
  });
});

describe('pasteGrid', () => {
  it('writes the pasted cells from the chosen cell', () => {
    const { rows, trimmed } = pasteGrid(grid, 1, 1, [['X', 'Y'], ['Z']]);

    expect(rows).toEqual([
      ['a', 'b', ''],
      ['c', 'X', 'Y'],
      ['', 'Z', ''],
    ]);
    expect(trimmed).toBe(false);
  });

  it('grows the table to hold what is pasted and pads every row', () => {
    const { rows } = pasteGrid([], 0, 0, [['1', '2', '3'], ['4']]);

    expect(rows).toEqual([
      ['1', '2', '3'],
      ['4', '', ''],
    ]);
  });

  it('cleans control characters, cuts long cells and reports what did not fit', () => {
    const long = 'y'.repeat(300);
    const rows = Array.from({ length: TABLE_MAX_ROWS }, () => ['a']);

    const tall = pasteGrid(rows, TABLE_MAX_ROWS - 1, 0, [['x'], ['overflow']]);
    const wide = pasteGrid([['a']], 0, TABLE_MAX_COLUMNS - 1, [['x', 'overflow']]);
    const messy = pasteGrid([['a']], 0, 0, [['tab\there', long]]);

    expect(tall.trimmed).toBe(true);
    expect(tall.rows).toHaveLength(TABLE_MAX_ROWS);
    expect(wide.trimmed).toBe(true);
    expect(wide.rows[0]).toHaveLength(TABLE_MAX_COLUMNS);
    expect(messy.rows[0][0]).toBe('tab here');
    expect(messy.rows[0][1]).toHaveLength(200);
    expect(messy.trimmed).toBe(true);
  });
});
